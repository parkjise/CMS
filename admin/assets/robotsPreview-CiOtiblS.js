import{c as i,d as c,u as m}from"./vendor-query-8IK3umHo.js";import{f as u}from"./index-CU7qXEB8.js";const l=/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;function p(t,e){const s=[...t.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map(a=>a[1]).map(a=>(a.startsWith(e)?a.slice(e.length):a)||"/"),r=s.filter(a=>l.test(a)).length;return{paths:s,posts:r,pages:s.length-r}}const o=["seo-settings"];function d(){return i({queryKey:o,queryFn:async()=>{const{data:t}=await u.get("/v1/seo-settings");return t.data},staleTime:60*1e3})}function w(){return i({queryKey:[...o,"limits"],queryFn:async()=>{const{data:t}=await u.get("/v1/seo-settings/limits");return t.data},staleTime:300*1e3})}function $(){const t=c();return m({mutationFn:async e=>{const{data:n}=await u.put("/v1/seo-settings",e);return n.data},onSuccess:e=>{t.setQueryData(o,e)}})}function S(t,e,n){return i({queryKey:[...o,"sitemap",t],queryFn:async()=>{const s=await fetch(t,{cache:"no-store"});if(!s.ok)throw new Error(`sitemap ${s.status}`);return p(await s.text(),e)},enabled:n,staleTime:0,retry:!1})}const f=t=>t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),g=(t,e)=>new RegExp(`^\\s*user-agent:\\s*${f(e)}\\s*$`,"im").test(t);function q(t,e){const n=Object.entries(e).filter(([s,r])=>r!=="keep"&&!g(t,s)).map(([s,r])=>`User-agent: ${s}
${r==="block"?"Disallow: /":"Allow: /"}`);return n.length===0?t:`${t.trimEnd()}

# AI 크롤러 (사이트 관리 → GEO 설정)
${n.join(`

`)}
`}export{d as a,S as b,q as c,$ as d,g as m,w as u};
