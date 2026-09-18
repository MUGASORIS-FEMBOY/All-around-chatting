// MUGS Chat Network — Cloudflare Worker
// No terminal is required if you use the Cloudflare Dashboard.
// Bind a Durable Object named CHAT_ROOM to this worker.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") return new Response("", {headers:cors});
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ok:true,service:"MUGS backend",time:new Date().toISOString()}),
        {headers:{"Content-Type":"application/json",...cors}});
    }
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket")
        return new Response("WebSocket required", {status:426,headers:cors});
      const id = env.CHAT_ROOM.idFromName("main");
      return env.CHAT_ROOM.get(id).fetch(request);
    }
    return new Response("MUGS backend online", {headers:cors});
  }
};

export class CHAT_ROOM {
  constructor(state) { this.state=state; this.sessions=new Set(); }
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket required",{status:426});
    const pair=new WebSocketPair(); const [client,server]=Object.values(pair);
    server.accept(); this.sessions.add(server);
    server.addEventListener("message", e=>{
      for(const s of this.sessions){try{s.send(e.data)}catch(_){}}
    });
    const cleanup=()=>this.sessions.delete(server);
    server.addEventListener("close",cleanup);server.addEventListener("error",cleanup);
    return new Response(null,{status:101,webSocket:client});
  }
}
