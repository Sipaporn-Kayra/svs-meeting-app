// Public read-only menu images. Upload and mapping changes require admin authentication.
export async function onRequestGet({params,env}){
 const id=String(params.id||"");
 if(!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(id))return new Response("Not found",{status:404});
 if(!env.MENU_IMAGES)return new Response("Image storage not configured",{status:503});
 const image=await env.MENU_IMAGES.get(id);
 if(!image)return new Response("Not found",{status:404});
 const ext=id.split(".").pop(),contentType={jpg:"image/jpeg",png:"image/png",webp:"image/webp"}[ext];
 return new Response(image.body,{headers:{"Content-Type":contentType,"Cache-Control":"public,max-age=31536000,immutable","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Access-Control-Allow-Origin":"*"}});
}
