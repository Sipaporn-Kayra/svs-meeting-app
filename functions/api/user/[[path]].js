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
 if(attendance==="ไม่เข้าร่วม")return conf.dates.map(day=>[timestamp,name,attendance,day,"-","-","-","-",0,"-"]);
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

const receiptHeaders=["EditTokenHash","RegistrationID","RequestID","Revision"];
function encodeText(value){return String(value??"")}
async function hashReceipt(receipt){
 const result=await crypto.subtle.digest("SHA-256",utf8.encode(receipt));
 return Array.from(new Uint8Array(result),x=>x.toString(16).padStart(2,"0")).join("");
}
function receiptValue(){return Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,"0")).join("")}
const validReceipt=v=>typeof v==="string"&&/^[a-f0-9]{48}$/.test(v);
const validRequestId=v=>typeof v==="string"&&/^[a-zA-Z0-9-]{12,80}$/.test(v);
async function registrationSheet(env,token){
 const all=await sheetRequest(env,token,"GET","/values/A1%3AN");
 const rows=all.values||[],headers=rows[0]||[];
 const expected=["Timestamp","Name","Attendance","Date","Lunch","Drink","Sport","Topic","Time","Category"];
 if(expected.some((x,i)=>i===9?headers[i]&&headers[i]!==x:headers[i]!==x))throw Error("Sheet registration columns do not match schema");
 if(headers.slice(10,14).some((h,i)=>h&&h!==receiptHeaders[i]))throw Error("Registration metadata columns K:N already contain another schema");
 return {rows,headers,records:rows.slice(1).map((v,i)=>({v,row:i+2})).filter(r=>r.v.some(x=>String(x||"").trim()))};
}
async function ensureReceiptHeaders(env,token,headers){
 const values=receiptHeaders.map((x,i)=>headers[i+10]||x);
 await sheetRequest(env,token,"PUT","/values/K1%3AN1?valueInputOption=RAW",{range:"K1:N1",majorDimension:"ROWS",values:[values]});
 if(!headers[9])await sheetRequest(env,token,"PUT","/values/J1?valueInputOption=RAW",{range:"J1",majorDimension:"ROWS",values:[["Category"]]});
}
function priorForName(records,name,dates){
 const dateSet=new Set(dates);
 return records.filter(r=>r.v[1]===name&&dateSet.has(r.v[3]));
}
function matchesByReceipt(records,name,receiptHash){
 return records.filter(r=>r.v[1]===name&&r.v[10]===receiptHash&&r.v[11]);
}
function decodeDrink(display,opts,conf){
 const options=opts?.drinks||[];
 const base=options.find(x=>display===x||display.startsWith(x+" ("))||"";
 const end=display.slice(base.length).replace(/^ \(/,"").replace(/\)$/,"");
 const parts=end.split(", ").map(x=>x.trim());
 return {drink:base,temperature:parts[0]||conf.temperature[0]||"",roast:parts.length>2?(parts[1]||""):(conf.roast.includes("ไม่ระบุ")?"ไม่ระบุ":conf.roast[0]||""),sweetness:parts.at(-1)||conf.sweetness[0]||""};
}
function restoreReceipt(records,conf){
 const first=records[0]?.v;
 const name=first?.[1]||"",attendance=first?.[2]||"เข้าร่วม";
 const days=[...new Set(records.map(r=>r.v[3]).filter(d=>conf.dates.includes(d)))];
 const choices={},agenda=[];
 for(const day of days){
  const group=records.filter(r=>r.v[3]===day);
  const firstMeal=group.find(r=>r.v[4]&&r.v[4]!=="-")?.v;
  const firstDrink=group.find(r=>r.v[5]&&r.v[5]!=="-")?.v;
  const firstSport=group.find(r=>r.v[6]&&r.v[6]!=="-")?.v;
  const food=(firstMeal?.[4]||"").split(", ").filter(x=>conf.days[day].food.includes(x));
  const drink=decodeDrink(firstDrink?.[5]||"",conf.days[day],conf);
  choices[day]={food,...drink,sport:firstSport?.[6]||conf.sport[0]||""};
  for(const row of group){
   const [,, , , , , ,topic,time,category]=row.v;
   if(topic&&topic!=="-")agenda.push({date:day,topic,minutes:Number(time)||15,category:validCategories.has(category)?category:"อื่นๆ"});
  }
 }
 return {name,attendance,dates:days,choices,agenda};
}
async function firstSheetId(env,token){
 const result=await sheetRequest(env,token,"GET","?fields="+encodeURIComponent("sheets(properties(sheetId,index,title))"));
 const first=result.sheets?.find(sheet=>sheet.properties?.index===0);
 if(!Number.isInteger(first?.properties?.sheetId))throw Error("First worksheet not found");
 return first.properties.sheetId;
}
function asCellRow(values){
 return {values:values.map(x=>({userEnteredValue:typeof x==="number"?{numberValue:x}:{stringValue:encodeText(x)}}))};
}
async function replaceRegistration(env,token,oldRecords,newRows){
 const sheetId=await firstSheetId(env,token);
 const indices=oldRecords.map(r=>r.row-1).sort((a,b)=>b-a);
 const requests=indices.map(index=>({deleteDimension:{range:{sheetId,dimension:"ROWS",startIndex:index,endIndex:index+1}}}));
 requests.push({appendCells:{sheetId,rows:newRows.map(asCellRow),fields:"userEnteredValue"}});
 await sheetRequest(env,token,"POST",":batchUpdate",{requests});
}
export async function onRequest({request,env,params}){
 const route=Array.isArray(params.path)?params.path.join("/"):params.path||"";
 if(request.method!=="POST"||!["config","submit","restore"].includes(route))return output({error:"Not found"},404);
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
  const sheet=await registrationSheet(env,token);
  const name=clean(body.name),receipt=clean(body.receipt);
  const previousHash=validReceipt(receipt)?await hashReceipt(receipt):"";
  if(route==="restore"){
   if(!config.employees.includes(name))return output({error:"กรุณาเลือกชื่อผู้ลงทะเบียน"},400);
   if(!previousHash)return output({error:"กรุณากรอกรหัสแก้ไข 48 ตัวอักษร"},400);
   const own=matchesByReceipt(sheet.records,name,previousHash);
   if(!own.length)return output({error:"ไม่พบรายการที่ตรงกับชื่อและรหัสแก้ไข กรุณาติดต่อ Admin"},404);
   if(own.some(r=>r.v[3]!=="-"&&!config.dates.includes(r.v[3])))return output({error:"รอบประชุมนี้ปิดรับลงทะเบียนแล้ว กรุณาติดต่อ Admin"},409);
   const versions=new Set(own.map(r=>r.v[13]||"1"));
   const ids=new Set(own.map(r=>r.v[11]));
   if(ids.size!==1||versions.size!==1)return output({error:"พบข้อมูลแก้ไขไม่สอดคล้อง กรุณาติดต่อ Admin"},409);
   return output({ok:true,registration:restoreReceipt(own,config),revision:[...versions][0]});
  }
  const rows=validate(body,config);
  const dates=body.attendance==="เข้าร่วม"?Array.isArray(body.dates)?body.dates:[]:config.dates;
  const existing=priorForName(sheet.records,name,dates);
  const requestId=clean(body.requestId);
  if(!validRequestId(requestId))return output({error:"กรุณาโหลดหน้าแบบฟอร์มใหม่แล้วลองอีกครั้ง"},400);
  // Google Sheets alone does not offer an atomic uniqueness constraint; sequential duplicates are blocked, but concurrent races need a serialized write service.
  const own=previousHash?matchesByReceipt(sheet.records,name,previousHash):[];
  const editing=own.length>0;
  if(previousHash&&!editing)return output({error:"รหัสแก้ไขไม่ถูกต้อง หรือไม่พบข้อมูลเดิมของคุณ"},403);
  if(editing){
   const oldId=own[0].v[11],revision=own[0].v[13]||"1";
   if(own.some(r=>r.v[11]!==oldId||r.v[13]!==revision))return output({error:"ข้อมูลเดิมไม่สอดคล้อง กรุณาติดต่อ Admin"},409);
   if(String(body.revision||"")!==String(revision))return output({error:"ข้อมูลมีการเปลี่ยนแปลง กรุณาโหลดรายการเดิมอีกครั้ง"},409);
   if(existing.some(r=>!own.some(y=>y.row===r.row)))return output({error:"ชื่อนี้มีการลงทะเบียนสำหรับวันที่เลือกอยู่แล้ว และไม่ได้เป็นรายการที่คุณกำลังแก้ไข"},409);
   if(own.some(r=>r.v[3]!=="-"&&!config.dates.includes(r.v[3])))return output({error:"รอบเดิมปิดรับลงทะเบียนแล้ว กรุณาติดต่อ Admin"},409);
   await ensureReceiptHeaders(env,token,sheet.headers);
   const updatedRows=rows.map(row=>[...row,previousHash,oldId,requestId,String(Number(revision)+1)]);
   await replaceRegistration(env,token,own,updatedRows);
   return output({ok:true,updated:true,rows:updatedRows.length,receipt,revision:String(Number(revision)+1)});
  }
  if(existing.length)return output({error:"ชื่อนี้มีข้อมูลลงทะเบียนสำหรับวันที่เลือกแล้ว หากเป็นข้อมูลของคุณ กรุณาใช้รหัสแก้ไขเดิมหรือแจ้ง Admin (ระบบไม่เพิ่มข้อมูลซ้ำ)",duplicate:true},409);
  const repeat=sheet.records.filter(r=>r.v[12]===requestId);
  if(repeat.length)return output({error:"รายการนี้เคยถูกบันทึกแล้ว กรุณาตรวจสอบก่อนส่งอีกครั้ง",duplicate:true},409);
  await ensureReceiptHeaders(env,token,sheet.headers);
  const newReceipt=receiptValue(),hash=await hashReceipt(newReceipt),registrationId=crypto.randomUUID();
  const metaRows=rows.map(row=>[...row,hash,registrationId,requestId,"1"]);
  await sheetRequest(env,token,"POST","/values/A%3AN:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",{majorDimension:"ROWS",values:metaRows});
  return output({ok:true,rows:metaRows.length,receipt:newReceipt,revision:"1"});
 }catch(e){
  if(/กรุณา|จำนวนวาระ/.test(e.message))return output({error:e.message},400);
  console.error("SVS user submission error:",e.message);
  return output({error:"ไม่สามารถบันทึกข้อมูลได้ กรุณาติดต่อ Admin"},503);
 }
}
