// LINE Messaging API webhook: capture group candidate only, never send messages.
// Set LINE_CHANNEL_SECRET as an encrypted Cloudflare Pages secret.
const encoder=new TextEncoder();
function out(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}
async function verify(body,signature,secret){
 if(!signature||!secret)return false;
 const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const mac=new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(body)));
 const b64=btoa(String.fromCharCode(...mac));
 const received=encoder.encode(signature),expected=encoder.encode(b64);
 if(received.length!==expected.length)return false;
 let different=0;for(let i=0;i<received.length;i++)different|=received[i]^expected[i];
 return different===0;
}
function b64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
async function googleToken(env){
 const sa=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||"{}");
 if(!sa.client_email||!sa.private_key)throw Error("Google settings not configured");
 const now=Math.floor(Date.now()/1000);
 const head=b64url(encoder.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
 const body=b64url(encoder.encode(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3300})));
 const keyBody=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 const key=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(keyBody),c=>c.charCodeAt(0)),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const signature=b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,encoder.encode(head+"."+body))));
 const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:head+"."+body+"."+signature})});
 if(!res.ok)throw Error("Google auth failed");
 return (await res.json()).access_token;
}
async function saveCandidate(env,groupId){
 const token=await googleToken(env),base="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(env.GOOGLE_SHEET_ID);
 const headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"};
 const settings=await fetch(base+"/values/"+encodeURIComponent("'Settings'!A:B"),{headers});
 if(!settings.ok)throw Error("Cannot read settings");
 const values=(await settings.json()).values||[];
 const index=values.findIndex((row,i)=>i>0&&row[0]==="LINE_CandidateGroupId");
 const url=index>=0?base+"/values/"+encodeURIComponent("'Settings'!B"+(index+1))+"?valueInputOption=RAW":
 base+"/values/"+encodeURIComponent("'Settings'!A:B")+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS";
 const method=index>=0?"PUT":"POST";
 const payload=index>=0?{range:"'Settings'!B"+(index+1),majorDimension:"ROWS",values:[[groupId]]}:
 {majorDimension:"ROWS",values:[["LINE_CandidateGroupId",groupId]]};
 const res=await fetch(url,{method,headers,body:JSON.stringify(payload)});
 if(!res.ok)throw Error("Cannot save LINE group candidate");
}
export async function onRequestPost({request,env}){
 const length=Number(request.headers.get("Content-Length")||0);
 if(length>250000)return out({error:"Payload too large"},413);
 const raw=await request.text();if(raw.length>250000)return out({error:"Payload too large"},413);
 if(!env.LINE_CHANNEL_SECRET)return out({error:"Webhook secret not configured"},503);
 const valid=await verify(raw,request.headers.get("X-Line-Signature"),env.LINE_CHANNEL_SECRET);
 if(!valid)return out({error:"Invalid LINE signature"},401);
 let payload;
 try{payload=JSON.parse(raw||"{}")}catch{return out({error:"Invalid JSON"},400)}
 const events=Array.isArray(payload.events)?payload.events:[];
 // Ignore every event except a verified group join or an explicit
 // /svs-connect command in a group. No chat message content is retained.
 const candidates=events.filter(e=>e?.source?.type==="group"&&/^C[a-f0-9]{32}$/i.test(e.source.groupId)&&
   (e.type==="join"||(e.type==="message"&&e.message?.type==="text"&&String(e.message.text||"").trim()==="/svs-connect")));
 if(candidates.length){
  try{await saveCandidate(env,candidates[candidates.length-1].source.groupId)}
  catch(e){console.error("SVS LINE webhook settings failure:",e.message);return out({error:"Unable to store group candidate"},503)}
 }
 return out({ok:true});
}
