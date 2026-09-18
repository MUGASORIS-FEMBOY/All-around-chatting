import { DurableObject } from "cloudflare:workers";

const MAX_TEXT = 2000;
const MAX_GROUPS_PER_OWNER = 100;
const MAX_HISTORY = 50;
const MAX_ROOM_MESSAGES = 500;

function json(data, status=200, extra={}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
      "access-control-allow-origin":"*",
      "access-control-allow-methods":"GET,POST,OPTIONS",
      "access-control-allow-headers":"Content-Type,X-MUGS-Token",
      ...extra
    }
  });
}
function clean(v,max){return String(v??"").trim().slice(0,max)}
function validToken(t){return /^[a-f0-9]{40,80}$/i.test(String(t||""))}
function roomId(v){return clean(v,64).replace(/[^a-zA-Z0-9_-]/g,"").toLowerCase()||"main"}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response("", {status:204,headers:{
        "access-control-allow-origin":"*",
        "access-control-allow-methods":"GET,POST,OPTIONS",
        "access-control-allow-headers":"Content-Type,X-MUGS-Token"
      }});
    }

    if (url.pathname === "/health") {
      return json({
        ok:true,
        service:"MUGS Free backend",
        version:"2.0-free",
        time:new Date().toISOString()
      });
    }

    if (url.pathname === "/debug") {
      return json({
        ok:true,
        websocket:true,
        sqliteDurableObjects:true,
        freePlanDesigned:true
      });
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
        return json({error:"WebSocket upgrade required"},426);

      const token = url.searchParams.get("token") || "";
      const room = roomId(url.searchParams.get("room") || "main");
      if (!validToken(token)) return json({error:"Invalid device token"},401);

      const system = env.MUGS_DO.get(env.MUGS_DO.idFromName("system"));
      const check = await system.fetch("https://mugs.internal/auth/check", {
        method:"POST",
        headers:{"X-MUGS-Token":token},
        body:"{}"
      });
      if (!check.ok) return check;

      const rdo = env.MUGS_DO.get(env.MUGS_DO.idFromName("room:"+room));
      return rdo.fetch(new Request(
        "https://mugs.internal/ws?room="+encodeURIComponent(room)+"&token="+encodeURIComponent(token),
        request
      ));
    }

    const token = request.headers.get("X-MUGS-Token") || "";
    if (url.pathname.startsWith("/api/") && !validToken(token))
      return json({error:"Missing or invalid X-MUGS-Token"},401);

    if (url.pathname.startsWith("/api/")) {
      const system = env.MUGS_DO.get(env.MUGS_DO.idFromName("system"));
      return system.fetch(new Request(
        "https://mugs.internal"+url.pathname+url.search,
        {
          method:request.method,
          headers:request.headers,
          body:["GET","HEAD"].includes(request.method)?undefined:request.body
        }
      ));
    }

    return new Response("MUGS backend online. Use /health, /debug, or /api/ endpoints.");
  }
};

export class MUGS_DO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx=ctx;
    this.env=env;
    this.ensureSchema();
    this.sessions=new Map();
    for (const ws of this.ctx.getWebSockets()) {
      const a=ws.deserializeAttachment();
      if(a) this.sessions.set(ws,a);
    }
    try {
      this.ctx.setWebSocketAutoResponse(
        new WebSocketRequestResponsePair("mugs-ping","mugs-pong")
      );
    } catch {}
  }

  ensureSchema() {
    try {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS users (
        token TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        device TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      )`);
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS friends (
        owner TEXT NOT NULL,
        other TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(owner,other)
      )`);
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`);
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS members (
        group_id TEXT NOT NULL,
        token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(group_id,token)
      )`);
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room TEXT NOT NULL,
        token TEXT NOT NULL,
        name TEXT NOT NULL,
        text TEXT NOT NULL,
        ts INTEGER NOT NULL
      )`);
      this.ctx.storage.sql.exec(`CREATE INDEX IF NOT EXISTS messages_room_ts ON messages(room,ts)`);
    } catch(e) {
      console.log("schema:", e?.message || e);
    }
  }

  async fetch(request) {
    const url=new URL(request.url);

    if(url.pathname==="/auth/check"){
      const token=request.headers.get("X-MUGS-Token")||"";
      const u=this.ctx.storage.sql.exec(
        `SELECT token,name,device FROM users WHERE token=?`,token
      ).toArray()[0];
      return u ? json({ok:true,user:u}) : json({error:"Unknown device token"},401);
    }

    if(url.pathname==="/api/register" && request.method==="POST"){
      const token=request.headers.get("X-MUGS-Token")||"";
      if(!validToken(token)) return json({error:"Invalid token"},401);
      const body=await request.json().catch(()=>({}));
      const name=clean(body.name,32)||"mug";
      const device=clean(body.device,48)||"Browser Device";
      const now=Date.now();

      this.ctx.storage.sql.exec(
        `INSERT INTO users(token,name,device,created_at,last_seen)
         VALUES(?,?,?,?,?)
         ON CONFLICT(token) DO UPDATE SET
         name=excluded.name,device=excluded.device,last_seen=excluded.last_seen`,
        token,name,device,now,now
      );
      return json({ok:true,user:{token,name,device}});
    }

    if(url.pathname==="/api/groups" && request.method==="GET"){
      const token=request.headers.get("X-MUGS-Token");
      const rows=this.ctx.storage.sql.exec(
        `SELECT g.id,g.name,g.owner,g.created_at
         FROM groups g JOIN members m ON m.group_id=g.id
         WHERE m.token=? ORDER BY g.created_at DESC`,token
      ).toArray();
      return json({groups:rows});
    }

    if(url.pathname==="/api/groups" && request.method==="POST"){
      const token=request.headers.get("X-MUGS-Token");
      const body=await request.json().catch(()=>({}));
      const name=clean(body.name,48);
      if(!name) return json({error:"Group name required"},400);

      const u=this.ctx.storage.sql.exec(
        `SELECT token FROM users WHERE token=?`,token
      ).toArray()[0];
      if(!u) return json({error:"Register this device first"},403);

      const count=this.ctx.storage.sql.exec(
        `SELECT COUNT(*) AS c FROM groups WHERE owner=?`,token
      ).toArray()[0].c;
      if(Number(count)>=MAX_GROUPS_PER_OWNER)
        return json({error:"Free-plan group limit reached"},429);

      const id="g_"+crypto.randomUUID().replaceAll("-","").slice(0,20);
      const now=Date.now();

      this.ctx.storage.sql.exec(
        `INSERT INTO groups(id,name,owner,created_at) VALUES(?,?,?,?)`,
        id,name,token,now
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO members(group_id,token,created_at) VALUES(?,?,?)`,
        id,token,now
      );

      return json({ok:true,group:{id,name,owner:token,created_at:now}},201);
    }

    const memberMatch=url.pathname.match(/^\/api\/groups\/([^/]+)\/members$/);
    if(memberMatch && request.method==="POST"){
      const group=roomId(memberMatch[1]);
      const owner=request.headers.get("X-MUGS-Token");
      const body=await request.json().catch(()=>({}));
      const other=String(body.token||"").trim();

      const g=this.ctx.storage.sql.exec(
        `SELECT id FROM groups WHERE id=? AND owner=?`,group,owner
      ).toArray()[0];
      if(!g) return json({error:"Only the group owner can invite devices"},403);
      if(!validToken(other)) return json({error:"Invalid target token"},400);

      const target=this.ctx.storage.sql.exec(
        `SELECT token FROM users WHERE token=?`,other
      ).toArray()[0];
      if(!target) return json({error:"Target device has not registered yet"},404);

      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO members(group_id,token,created_at) VALUES(?,?,?)`,
        group,other,Date.now()
      );
      return json({ok:true,group,member:other});
    }

    if(url.pathname==="/api/history" && request.method==="GET"){
      const token=request.headers.get("X-MUGS-Token");
      const room=roomId(url.searchParams.get("room")||"main");

      if(room!=="main"){
        const m=this.ctx.storage.sql.exec(
          `SELECT token FROM members WHERE group_id=? AND token=?`,room,token
        ).toArray()[0];
        if(!m) return json({error:"Not a member of this group"},403);
      }

      const rdo=this.env.MUGS_DO.get(this.env.MUGS_DO.idFromName("room:"+room));
      return rdo.fetch(new Request(
        "https://mugs.internal/room-history?room="+encodeURIComponent(room),
        {headers:{"X-MUGS-Token":token}}
      ));
    }

    if(url.pathname==="/api/friends" && request.method==="GET"){
      const token=request.headers.get("X-MUGS-Token");
      const rows=this.ctx.storage.sql.exec(
        `SELECT f.other,u.name,u.device,f.status,f.created_at
         FROM friends f LEFT JOIN users u ON u.token=f.other
         WHERE f.owner=? ORDER BY f.created_at DESC`,token
      ).toArray();
      return json({friends:rows});
    }

    if(url.pathname==="/api/friends" && request.method==="POST"){
      const token=request.headers.get("X-MUGS-Token");
      const body=await request.json().catch(()=>({}));
      const other=String(body.token||"").trim();
      if(!validToken(other)||other===token)
        return json({error:"Invalid target token"},400);

      const target=this.ctx.storage.sql.exec(
        `SELECT token FROM users WHERE token=?`,other
      ).toArray()[0];
      if(!target) return json({error:"Target device has not registered yet"},404);

      const now=Date.now();
      this.ctx.storage.sql.exec(
        `INSERT INTO friends(owner,other,status,created_at)
         VALUES(?,?,?,?)
         ON CONFLICT(owner,other) DO UPDATE SET status=excluded.status`,
        token,other,"accepted",now
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO friends(owner,other,status,created_at)
         VALUES(?,?,?,?)
         ON CONFLICT(owner,other) DO UPDATE SET status=excluded.status`,
        other,token,"accepted",now
      );
      return json({ok:true,status:"accepted"});
    }

    if(url.pathname==="/room-history"){
      const room=roomId(url.searchParams.get("room")||"main");
      const rows=this.ctx.storage.sql.exec(
        `SELECT id,room,token,name,text,ts
         FROM messages WHERE room=? ORDER BY ts DESC LIMIT ?`,
        room,MAX_HISTORY
      ).toArray().reverse();
      return json({messages:rows});
    }

    if(url.pathname==="/ws"){
      return this.handleWebSocket(request,url);
    }

    return json({error:"Not found"},404);
  }

  async handleWebSocket(request,url){
    const token=url.searchParams.get("token")||"";
    const room=roomId(url.searchParams.get("room")||"main");

    if(!validToken(token)) return json({error:"Invalid token"},401);

    const user=this.ctx.storage.sql.exec(
      `SELECT token,name,device FROM users WHERE token=?`,token
    ).toArray()[0];
    if(!user) return json({error:"Unknown device token"},401);

    if(room!=="main"){
      const member=this.ctx.storage.sql.exec(
        `SELECT token FROM members WHERE group_id=? AND token=?`,room,token
      ).toArray()[0];
      if(!member) return json({error:"Not a member of this group"},403);
    }

    const pair=new WebSocketPair();
    const [client,server]=Object.values(pair);

    this.ctx.acceptWebSocket(server,[room]);
    const attachment={token,name:user.name,device:user.device,room};
    server.serializeAttachment(attachment);
    this.sessions.set(server,attachment);

    this.ctx.storage.sql.exec(
      `UPDATE users SET last_seen=? WHERE token=?`,Date.now(),token
    );

    this.broadcast(room,{type:"presence",online:true,name:user.name,room},server);
    server.send(JSON.stringify({
      type:"ready",room,online:this.ctx.getWebSockets(room).length
    }));

    return new Response(null,{status:101,webSocket:client});
  }

  webSocketMessage(ws,message){
    const s=ws.deserializeAttachment()||{};
    if(typeof message!=="string") return;

    let p;
    try{p=JSON.parse(message)}
    catch{return this.sendError(ws,"Invalid JSON")}

    if(p.type==="ping"){
      try{ws.send(JSON.stringify({type:"pong",ts:Date.now()}))}catch{}
      return;
    }

    if(p.type!=="message") return this.sendError(ws,"Unknown message type");

    const text=clean(p.text,MAX_TEXT);
    if(!text) return;

    const now=Date.now();
    const id=crypto.randomUUID();

    this.ctx.storage.sql.exec(
      `INSERT INTO messages(id,room,token,name,text,ts) VALUES(?,?,?,?,?,?)`,
      id,s.room,s.token,s.name,text,now
    );

    this.trimRoom(s.room);

    this.broadcast(s.room,{
      type:"message",id,room:s.room,token:s.token,
      name:s.name,text,ts:now
    },null);
  }

  webSocketClose(ws){
    const s=ws.deserializeAttachment()||{};
    this.sessions.delete(ws);
    if(s.room)
      this.broadcast(s.room,{type:"presence",online:false,name:s.name,room:s.room},ws);
  }

  webSocketError(ws){
    this.sessions.delete(ws);
    try{ws.close(1011,"WebSocket error")}catch{}
  }

  broadcast(room,payload,skip){
    const data=JSON.stringify(payload);
    for(const ws of this.ctx.getWebSockets(room)){
      if(ws!==skip){
        try{ws.send(data)}catch{}
      }
    }
  }

  sendError(ws,error){
    try{ws.send(JSON.stringify({type:"error",error}))}catch{}
  }

  trimRoom(room){
    try{
      const row=this.ctx.storage.sql.exec(
        `SELECT COUNT(*) AS c FROM messages WHERE room=?`,room
      ).toArray()[0];

      if(Number(row.c)>MAX_ROOM_MESSAGES){
        this.ctx.storage.sql.exec(
          `DELETE FROM messages
           WHERE room=? AND id NOT IN
           (SELECT id FROM messages WHERE room=? ORDER BY ts DESC LIMIT ?)`,
          room,room,MAX_ROOM_MESSAGES
        );
      }
    }catch(e){console.log("trim:",e?.message||e)}
  }
}
