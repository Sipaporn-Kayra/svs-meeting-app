// Cloudflare Pages Functions: same-origin protected admin API.
// Required encrypted environment secrets: ADMIN_PASSWORD, SESSION_SECRET,
// GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEET_ID.
// Recommended: Cloudflare WAF rate limiting on /api/admin/login.
const encoder = new TextEncoder();
const secureHeaders = {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
function json(data,status=200,headers={}) {
  return new Response(JSON.stringify(data),{status,headers:{...secureHeaders,"Content-Type":"application/json; charset=utf-8",...headers}});
}
function b64url(bytes) {
  let s="";for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
function fromB64url(s) {
  const raw=atob(s.replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function digest(text) {return new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(text)))}
function constantEqual(a,b){if(a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a[i]^b[i];return v===0}
async function sign(secret,message){
 const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(message))));
}
function cookies(request){return Object.fromEntries((request.headers.get("Cookie")||"").split(";").map(x=>x.trim().split(/=(.*)/s).slice(0,2)).filter(x=>x.length===2))}
async function authenticated(request,env){
 const token=cookies(request).svs_admin;
 if(!token||!env.SESSION_SECRET)return false;
 const parts=token.split(".");if(parts.length!==2)return false;
 try {
   const expected=await sign(env.SESSION_SECRET,parts[0]);
   if(!constantEqual(fromB64url(parts[1]),fromB64url(expected)))return false;
   const data=JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
   return data.role==="admin"&&Number.isFinite(data.exp)&&data.exp>Date.now();
 }catch{return false}
}
function cookie(value,maxAge){return "svs_admin="+value+"; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age="+maxAge}
async function googleToken(env){
 const sa=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||"{}");
 if(!sa.private_key||!sa.client_email)throw new Error("Google service account is not configured");
 const now=Math.floor(Date.now()/1000);
 const head=b64url(encoder.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
 const body=b64url(encoder.encode(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/spreadsheets.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3300})));
 const pk=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 const key=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(pk),c=>c.charCodeAt(0)),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const assertion=head+"."+body+"."+b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,encoder.encode(head+"."+body))));
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
 if(!response.ok)throw new Error("Google OAuth token request failed");
 const result=await response.json();if(!result.access_token)throw new Error("Google OAuth token missing");return result.access_token;
}
async function readSheets(env){
 if(!env.GOOGLE_SHEET_ID)throw new Error("Sheet id not configured");
 const token=await googleToken(env);
 const ranges=["'Sheet1'!A:I","'Settings'!A:B"];
 // Existing Streamlit uses db.sheet1: its default tab is often Sheet1, but verify actual tab name.
 const url="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(env.GOOGLE_SHEET_ID)+"/values:batchGet?"+ranges.map(r=>"ranges="+encodeURIComponent(r)).join("&");
 const response=await fetch(url,{headers:{Authorization:"Bearer "+token}});
 if(!response.ok)throw new Error("Google Sheets read failed (check sharing and tab names)");
 const payload=await response.json();
 return payload.valueRanges||[];
}
function records(values){
 const [headers=[],...rows]=values||[];
 return rows.filter(r=>r.some(v=>String(v||"").trim())).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??""])));
}
function stableKey(s){
 // Stable across refreshes without exposing raw row content in keys.
 return s;
}
function parseData(data,date){
 const users=records(data[0]?.values||[]);
 const settings=records(data[1]?.values||[]);
 const globalDates=(settings.find(r=>r.Key==="Global_Dates")?.Value||"").split(",").map(s=>s.trim()).filter(Boolean);
 const filtered=users.filter(r=>r.Attendance==="เข้าร่วม"&&(!date||r.Date===date));
 const agendas=[],people=new Set(),food=new Map(),drinks=new Map();
 const occurrences=new Map();
 for(const r of filtered){
   if(r.Name)people.add(r.Name);
   if(r.Lunch&&r.Lunch!=="-"&&r.Lunch!=="ไม่ได้ระบุ")for(const item of r.Lunch.split(",").map(s=>s.trim()).filter(Boolean))food.set(item,(food.get(item)||0)+1);
   if(r.Drink&&r.Drink!=="-"&&r.Drink!=="ไม่ได้ระบุ")drinks.set(r.Drink,(drinks.get(r.Drink)||0)+1);
   if(r.Topic&&r.Topic.trim()!=="-"&&r.Topic.trim()){
     const identity=[r.Timestamp,r.Name,r.Date,r.Topic,r.Time].join("|");
     const count=(occurrences.get(identity)||0)+1;occurrences.set(identity,count);
     agendas.push({source_id:stableKey(identity+"|"+count),date:r.Date,presenter:r.Name||"",topic:r.Topic,minutes:Math.max(0,Number(r.Time)||0),category:"อื่น ๆ"});
   }
 }
 return {dates:globalDates,selected_date:date||null,participants:people.size,agendas,food:[...food].map(([name,count])=>({name,count})),drinks:[...drinks].map(([name,count])=>({name,count})),fetched_at:new Date().toISOString()};
}
export async function onRequest({request,env,params}){
 const route=(params.path||[]).join("/");
 if(request.method==="POST"&&request.headers.get("Origin")!==new URL(request.url).origin)return json({error:"Invalid request origin"},403);
 try {
   if(route==="login"&&request.method==="POST"){
     if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET||env.SESSION_SECRET.length<32)return json({error:"Admin authentication is not configured"},503);
     const body=await request.json().catch(()=>({}));
     const submitted=typeof body.password==="string"?body.password:"";
     if(!submitted||submitted.length>256)return json({error:"Invalid credentials"},401);
     const a=await digest(submitted),b=await digest(env.ADMIN_PASSWORD);
     if(!constantEqual(a,b))return json({error:"Invalid credentials"},401);
     const payload=b64url(encoder.encode(JSON.stringify({role:"admin",exp:Date.now()+8*60*60*1000})));
     const token=payload+"."+await sign(env.SESSION_SECRET,payload);
     return json({ok:true},200,{"Set-Cookie":cookie(token,8*60*60)});
   }
   if(route==="logout"&&request.method==="POST")return json({ok:true},200,{"Set-Cookie":cookie("",0)});
   if(!await authenticated(request,env))return json({error:"Unauthorized"},401);
   if(route==="session"&&request.method==="GET")return json({authenticated:true});
   if(route==="registrations"&&request.method==="GET"){
     const date=new URL(request.url).searchParams.get("date")||"";
     if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:"Invalid date"},400);
     const data=await readSheets(env);
     return json(parseData(data,date));
   }
   return json({error:"Not found"},404);
 } catch(err){
   console.error("SVS admin API error:",err.message);
   return json({error:"Unable to complete request. Check backend configuration and logs."},503);
 }
}
