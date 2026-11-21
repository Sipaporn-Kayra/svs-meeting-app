// User registration API for SVS Cloudflare Pages test branch.
// Public registration endpoint; requires server-side GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEET_ID.
// Admin authentication remains separate. Limit abuse with Cloudflare rate limiting before broad sharing.
const utf8=new TextEncoder();
const noStore={"Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8","X-Content-Type-Options":"nosniff"};
function output(data,status=200){return new Response(JSON.stringify(data),{status,headers:noStore})}
function base64url(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
async function accessToken(env){
 const sa=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||"{}");
 if(!sa.client_email||!sa.private_key)throw Error("Service account is not configured");
 const now=Math.floor(Date.now()/1000);
 const head=base64url(utf8.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
 const body=base64url(utf8.encode(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3300})));
 const pk=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 const key=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(pk),x=>x.charCodeAt(0)),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const assertion=head+"."+body+"."+base64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,utf8.encode(head+"."+body))));
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
 if(!r.ok)throw Error("Google token error "+r.status);
 const data=await r.json();return data.access_token;
}
async function sheetRequest(env,token,method,path,body){
 const uri="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(env.GOOGLE_SHEET_ID)+path;
 const r=await fetch(uri,{method,headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok){console.error("SVS user Google API status:",r.status);throw Error("Google Sheets operation failed")}
 return r.json();
}
async function readConfig(env,token){
 const data=await sheetRequest(env,token,"GET","/values/"+encodeURIComponent("'Settings'!A:B"));
 const entries=Object.fromEntries((data.values||[]).slice(1).filter(r=>r.length>=2).map(r=>[r[0],r[1]]));
 const split=x=>String(x||"").split(",").map(v=>v.trim()).filter(Boolean);
 const dates=split(entries.Global_Dates);
 const days={};
 for(const day of dates){
   const parseImages=v=>{try{const o=JSON.parse(v||"{}");return o&&typeof o==="object"&&!Array.isArray(o)?o:{}}catch{return {}}};
   days[day]={food:split(entries["Lunch_"+day]),drinks:split(entries["Drink_"+day]),foodImages:parseImages(entries["LunchImage_"+day]),drinkImages:parseImages(entries["DrinkImage_"+day]),foodBanner:entries["LunchBanner_"+day]||"",drinkBanner:entries["DrinkBanner_"+day]||""};
 }
 return {dates,employees:split(entries.Global_Employees),sport:split(entries.Global_Sport),sweetness:split(entries.Global_Sweetness),roast:split(entries.Global_Roast),temperature:split(entries.Global_Temp),days};
}
const validCategories=new Set(["สถานการณ์โรคระบาด/Case study","งานทดลองเวชภัณฑ์/คัดเลือกเวชภัณฑ์","Project","อื่นๆ"]);
const clean=v=>String(v??"").trim();
function validate(payload,conf){
 const name=clean(payload.name),attendance=clean(payload.attendance);
 if(!conf.employees.includes(name))throw Error("กรุณาเลือกชื่อจากรายชื่อพนักงาน");
 if(!["เข้าร่วม","ไม่เข้าร่วม"].includes(attendance))throw Error("กรุณาเลือกสถานะเข้าร่วม");
 const selected=Array.isArray(payload.dates)?[...new Set(payload.dates.map(clean))]:[];
 if(attendance==="เข้าร่วม"&&(!selected.length||selected.length>10||selected.some(d=>!conf.dates.includes(d))))throw Error("กรุณาเลือกวันที่เข้าร่วมให้ถูกต้อง");
 const agenda=Array.isArray(payload.agenda)?payload.agenda:[];
 if(agenda.length>30)throw Error("จำนวนวาระเกินขีดจำกัด");
 const indexed={};
 for(const d of selected)indexed[d]=[];
 for(const item of agenda){
  const date=clean(item.date),topic=clean(item.topic),minutes=Number(item.minutes),category=clean(item.category);
  if(!topic)continue;
  if(!selected.includes(date)||topic.length>250||!Number.isInteger(minutes)||minutes<1||minutes>240||!validCategories.has(category))throw Error("กรุณาตรวจสอบหัวข้อ หมวดหมู่ และเวลานำเสนอ");
  indexed[date].push({topic,minutes,category});
 }
 const choices=payload.choices&&typeof payload.choices==="object"?payload.choices:{};
 const rows=[],timestamp=new Date().toISOString();
 if(attendance==="ไม่เข้าร่วม")return [[timestamp,name,attendance,"-","-","-","-","-",0,"-"]];
 for(const date of selected){
  const opts=conf.days[date],c=choices[date]||{};
  const food=Array.isArray(c.food)?[...new Set(c.food.map(clean))]:[];
  if(food.some(x=>!opts.food.includes(x))||food.length>opts.food.length)throw Error("เมนูอาหารไม่ถูกต้อง");
  const base=clean(c.drink),temperature=clean(c.temperature),roast=clean(c.roast),sweet=clean(c.sweetness),sport=clean(c.sport);
  if(!opts.drinks.includes(base)||!conf.temperature.includes(temperature)||!conf.roast.includes(roast)||!conf.sweetness.includes(sweet)||!conf.sport.includes(sport))throw Error("กรุณาตรวจสอบเครื่องดื่มและกิจกรรม");
  const drink=base+" ("+temperature+(roast==="ไม่ระบุ"?"":", "+roast)+", "+sweet+")";
  const lunch=food.join(", ")||"ไม่ได้ระบุ",list=indexed[date];
  if(!list.length){rows.push([timestamp,name,attendance,date,lunch,drink,sport,"-",0,"-"]);continue}
  list.forEach((a,i)=>rows.push([timestamp,name,attendance,date,i? "-":lunch,i? "-":drink,i? "-":sport,a.topic,a.minutes,a.category]));
 }
 return rows;
}
export async function onRequest({request,env,params}){
 const route=Array.isArray(params.path)?params.path.join("/"):params.path||"";
 if(request.method!=="POST"||!["config","submit"].includes(route))return output({error:"Not found"},404);
 const origin=request.headers.get("Origin");
 if(origin!==new URL(request.url).origin)return output({error:"Invalid request origin"},403);
 const fetchSite=request.headers.get("Sec-Fetch-Site");
 if(fetchSite&&fetchSite!=="same-origin"&&fetchSite!=="none")return output({error:"Cross-site request denied"},403);
 if(!(request.headers.get("Content-Type")||"").toLowerCase().startsWith("application/json"))return output({error:"Invalid content type"},415);
 if(Number(request.headers.get("Content-Length")||0)>60000)return output({error:"Payload too large"},413);
 try{
  const raw=await request.text();if(raw.length>60000)return output({error:"Payload too large"},413);
  const body=JSON.parse(raw||"{}");
  if(!env.GOOGLE_SHEET_ID)throw Error("Sheet ID missing");
  const token=await accessToken(env);
  const config=await readConfig(env,token);
  if(route==="config")return output(config);
  const rows=validate(body,config);
  // Existing Streamlit uses A:I. New Cloudflare rows write A:J and use the
  // optional Category column; no existing data is overwritten.
  const first=await sheetRequest(env,token,"GET","/values/A1%3AJ1");
  const headers=first.values?.[0]||[];
  const expected=["Timestamp","Name","Attendance","Date","Lunch","Drink","Sport","Topic","Time"];
  if(expected.some((v,i)=>headers[i]!==v))throw Error("Sheet columns do not match existing registration schema");
  if(!headers[9]){
   await sheetRequest(env,token,"PUT","/values/J1?valueInputOption=RAW",{range:"J1",majorDimension:"ROWS",values:[["Category"]]});
  }else if(headers[9]!=="Category")throw Error("Column J is already used by another field");
  await sheetRequest(env,token,"POST","/values/A%3AJ:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",{majorDimension:"ROWS",values:rows});
  return output({ok:true,rows:rows.length});
 }catch(e){
  if(/กรุณา|จำนวนวาระ/.test(e.message))return output({error:e.message},400);
  console.error("SVS user submission error:",e.message);
  return output({error:"ไม่สามารถบันทึกข้อมูลได้ กรุณาติดต่อ Admin"},503);
 }
}
