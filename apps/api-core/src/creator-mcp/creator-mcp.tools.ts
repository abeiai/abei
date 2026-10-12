import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AppException } from '../common/app-exception.js';
import type { CreatorPrincipal, CreatorScope } from '../creator-auth/creator-auth.protocol.js';
import type { CreatorService } from '../creator/creator.service.js';
const id = z.string().min(1).max(128);
const version = z.number().int().min(0).max(2147483647);
const base = {schemaVersion:z.literal(1),externalId:z.string().trim().min(1).max(120),expectedVersion:version};
const page = z.strictObject({position:z.number().int().min(0).max(24),caption:z.string().max(500).optional(),narration:z.string().max(1000).optional(),imagePrompt:z.string().max(2000).optional(),textInImage:z.boolean().optional(),imageAssetId:id.nullable().optional(),audioAssetId:id.nullable().optional()});
export const bookSchema=z.strictObject({...base,title:z.string().min(1).max(100),brief:z.string().max(30000).optional(),audience:z.string().max(100).optional(),style:z.string().min(1).max(80),aspectRatio:z.enum(['21:10','16:9','3:2','4:3','5:4','1:1','4:5','3:4','2:3','9:16']).optional(),isSpread:z.boolean().optional(),pageCount:z.number().int().min(4).max(24),coverAssetId:id.optional(),pages:z.array(page).max(25)});
export const albumSchema=z.strictObject({...base,title:z.string().min(2).max(80),summary:z.string().min(1).max(2000),coverAssetId:id,items:z.array(z.strictObject({bookId:id,expectedVersion:version,displayName:z.string().min(1).max(120)})).min(1).max(200)});
export const uploadSchema=z.strictObject({...base,expectedVersion:z.literal(0),kind:z.enum(['IMAGE','AUDIO']),mimeType:z.enum(['image/png','image/jpeg','image/webp','audio/mpeg','audio/wav','audio/mp4','audio/ogg']),size:z.number().int().positive().max(26214400),sha256:z.string().regex(/^[a-f0-9]{64}$/)});
export function creatorMcpServer(service:CreatorService,p:CreatorPrincipal) {
 const server=new McpServer({name:'abei-creator',version:'0.1.0'},{capabilities:{tools:{}}});
 function register(name:string,description:string,scope:CreatorScope,schema:z.ZodObject<any>,run:(a:any)=>Promise<unknown>){
  if(!p.scopes.includes(scope))return;
  const read=scope==='creator:read';
  server.registerTool(name,{description,inputSchema:schema,annotations:{readOnlyHint:read,destructiveHint:!read,idempotentHint:true,openWorldHint:false}},async args=>{
   try {const result=JSON.parse(JSON.stringify(await run(args)));return {content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:{result}};}
   catch(error){const known=error instanceof AppException;return {isError:true,content:[{type:'text' as const,text:JSON.stringify({status:known?error.getStatus():500,message:known?error.message:'创作服务暂不可用，请稍后重试'})}]};}
  });
 }
 const empty=z.strictObject({}),identified=z.strictObject({id}),submit=z.strictObject({id,expectedVersion:version});
 register('creator_capabilities','查询版本、作品范围与素材限制','creator:read',empty,()=>service.capabilities(p));
 register('creator_account','查看当前创作账号及授权范围','creator:read',empty,()=>service.account(p));
 register('creator_books_list','列出本账号通过客户端同步的绘本（最多100本），不包含全部历史网站作品','creator:read',empty,()=>service.listBooks(p));
 register('creator_book_get','读取本账号通过客户端同步的绘本、当前版本及审核状态','creator:read',identified,a=>service.getBook(p,a.id));
 register('creator_book_validate','检查绘本当前版本完整性','creator:read',identified,a=>service.validateBook(p,a.id));
 register('creator_book_save','保存绘本草稿；不会投稿。冲突时先读取当前版本','creator:write',bookSchema,a=>service.saveBook(p,a));
 register('creator_book_submit','将指定绘本版本投稿审核，仅在用户任务包含投稿时调用','creator:submit',submit,a=>service.submitBook(p,a.id,{expectedVersion:a.expectedVersion}));
 register('creator_albums_list','列出本账号通过客户端同步的专辑（最多100个）','creator:read',empty,()=>service.listAlbums(p));
 register('creator_album_get','读取本账号客户端同步专辑及当前审核状态','creator:read',identified,a=>service.getAlbum(p,a.id));
 register('creator_album_validate','检查专辑及固定成员版本完整性','creator:read',identified,a=>service.validateAlbum(p,a.id));
 register('creator_album_save','保存专辑并固定成员版本；不会投稿','creator:write',albumSchema,a=>service.saveAlbum(p,a));
 register('creator_album_submit','将指定专辑版本投稿审核，仅在用户任务包含投稿时调用','creator:submit',submit,a=>service.submitAlbum(p,a.id,{expectedVersion:a.expectedVersion}));
 register('creator_upload_create','创建限时素材上传会话。返回的上传凭证仅交给本地助手私有状态或受限执行通道；不要复制到对话正文、作品清单或日志。不传媒体base64','creator:write',uploadSchema,a=>service.assets.createUpload(p,a));
 register('creator_upload_status','查询本账号素材上传进度，不返回媒体内容','creator:read',identified,a=>service.assets.uploadStatus(p,a.id));
 register('creator_work_status','查看客户端同步作品状态和版本','creator:read',z.strictObject({id,kind:z.enum(['BOOK','ALBUM'])}),a=>service.status(p,a.kind,a.id));
 return server;
}
