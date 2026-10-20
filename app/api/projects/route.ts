import { env } from "cloudflare:workers";
import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
function identity(req:Request){return req.headers.get("oai-authenticated-user-id")}
function json(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store"}})}
export async function GET(req:NextRequest){
 const user=identity(req);if(!user)return json({error:"로그인이 필요합니다"},401);
 if(!env.DB||!env.BUCKET)return json({error:"저장소를 사용할 수 없습니다"},503);
 const id=req.nextUrl.searchParams.get("id");
 if(id){const record=await env.DB.prepare("SELECT * FROM projects WHERE id=? AND owner=?").bind(id,user).first<{object_key:string}>();if(!record)return json({error:"작업을 찾을 수 없습니다"},404);const object=await env.BUCKET.get(record.object_key);if(!object)return json({error:"파일을 찾을 수 없습니다"},404);return new Response(object.body,{headers:{"Content-Type":"application/json","Cache-Control":"no-store","Content-Disposition":"attachment; filename=workspace.json"}})}
 const result=await env.DB.prepare("SELECT id,title,created_at FROM projects WHERE owner=? ORDER BY created_at DESC LIMIT 40").bind(user).all();return json({projects:result.results});
}
export async function POST(req:NextRequest){
 const user=identity(req);if(!user)return json({error:"로그인이 필요합니다"},401);
 if(req.headers.get("origin")!==new URL(req.url).origin)return json({error:"잘못된 요청"},403);
 if(!env.DB||!env.BUCKET)return json({error:"저장소를 사용할 수 없습니다"},503);
 // Bound the actual body stream, not only Content-Length.
 const reader=req.body?.getReader();if(!reader)return json({error:"빈 요청"},400);let size=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){await reader.cancel();return json({error:"저장은 8MB 이하만 가능합니다"},413)}chunks.push(value)}
 const bytes=new Uint8Array(size);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length}let data;try{data=JSON.parse(new TextDecoder().decode(bytes))}catch{return json({error:"잘못된 데이터"},400)}
 if(typeof data.title!=="string"||!data.payload||typeof data.payload!=="object")return json({error:"잘못된 작업 데이터"},400);
 const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM projects WHERE owner=?").bind(user).first<{n:number}>();if((count?.n??0)>=40)return json({error:"최대 40개 작업을 보관할 수 있습니다. 이전 작업을 삭제해 주세요."},409);
 const id=crypto.randomUUID(),key=`${user}/${id}.json`;await env.BUCKET.put(key,JSON.stringify(data.payload),{httpMetadata:{contentType:"application/json"}});
 try{await env.DB.prepare("INSERT INTO projects (id,owner,title,object_key,created_at) VALUES (?,?,?,?,?)").bind(id,user,data.title.slice(0,120),key,new Date().toISOString()).run()}catch(e){await env.BUCKET.delete(key);throw e}return json({id},201);
}
export async function DELETE(req:NextRequest){const user=identity(req);if(!user)return json({error:"로그인이 필요합니다"},401);if(req.headers.get("origin")!==new URL(req.url).origin)return json({error:"잘못된 요청"},403);if(!env.DB||!env.BUCKET)return json({error:"저장소를 사용할 수 없습니다"},503);const id=req.nextUrl.searchParams.get("id");const row=await env.DB.prepare("SELECT object_key FROM projects WHERE id=? AND owner=?").bind(id,user).first<{object_key:string}>();if(!row)return json({error:"작업을 찾을 수 없습니다"},404);await env.BUCKET.delete(row.object_key);await env.DB.prepare("DELETE FROM projects WHERE id=? AND owner=?").bind(id,user).run();return json({ok:true})}
