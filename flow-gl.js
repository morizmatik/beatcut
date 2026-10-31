(function(L){"use strict";const _=["off","blend","flow"];function U(e){return!e||e.fx===!1?"off":_.includes(e.smooth)?e.smooth:e.blend===!1?"off":"blend"}function B(e,m,b=4){if(!(e>0&&m>0))return[];const a=Math.max(e,m),v=Math.min(a,Math.max(160,Math.min(480,Math.round(a/3))))/a,d=[];let l=Math.max(1,Math.round(e*v)),x=Math.max(1,Math.round(m*v));for(let p=0;p<b&&!(p&&Math.min(l,x)<8);p++)d.push([l,x]),l=Math.max(1,Math.round(l/2)),x=Math.max(1,Math.round(x/2));return d}function I(e){let m=0,b="";for(const a of e){if(!(a.mix>0&&a.b!==a.a))continue;const n=(a.clip||0)+":"+a.a+":"+a.b;n!==b&&(m++,b=n)}return m}function N(e,m){if(!(m>0)||!e||e.length<3)return!1;const b=e.slice().sort((a,n)=>a-n);return b[b.length>>1]>m}const k={MODES:_,LEVELS:4,smoothMode:U,pyramidSizes:B,flowPairs:I,flowTooSlow:N},O=`#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,q=`#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uSize;
uniform float uSpread;
uniform float uLuma;
out vec4 o;
float px(vec2 uv) {
  vec3 c = texture(uSrc, uv).rgb;
  return uLuma > 0.5 ? dot(c, vec3(0.299, 0.587, 0.114)) : c.r;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uSize, h = uSpread / uSize;
  o = vec4(0.25 * (px(uv - h) + px(uv + h) + px(uv + vec2(h.x, -h.y)) + px(uv + vec2(-h.x, h.y))));
}`,y=`#version 300 es
precision highp float;
uniform sampler2D uI0;
uniform sampler2D uI1;
uniform sampler2D uFc;
uniform vec2 uSize;
uniform float uHasC;
uniform int uR;
out vec4 o;
float p0[25];
float cost(vec2 x, vec2 d) {
  float s = 0.0;
  int k = 0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    s += abs(p0[k] - texture(uI1, (x + vec2(i, j) + d) / uSize).r);
    k++;
  }
  return s;
}
void main() {
  vec2 x = gl_FragCoord.xy;
  int k = 0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) { p0[k] = texture(uI0, (x + vec2(i, j)) / uSize).r; k++; }
  vec2 c = vec2(0.0);
  if (uHasC > 0.5) {
    // прогноз с грубого уровня и прогнозы соседей – на границе движения сосед бывает вернее
    c = texture(uFc, x / uSize).rg * uSize;
    float bc = cost(x, c);
    for (int n = 0; n < 4; n++) {
      vec2 off = n == 0 ? vec2(3.0, 0.0) : n == 1 ? vec2(-3.0, 0.0) : n == 2 ? vec2(0.0, 3.0) : vec2(0.0, -3.0);
      vec2 cand = texture(uFc, (x + off) / uSize).rg * uSize;
      float cc = cost(x, cand);
      if (cc < bc) { bc = cc; c = cand; }
    }
  }
  float cs[49];
  float best = 1e9, sum = 0.0, cnt = 0.0;
  int bi = 0, bj = 0;
  for (int j = -3; j <= 3; j++) for (int i = -3; i <= 3; i++) {
    int idx = (j + 3) * 7 + (i + 3);
    cs[idx] = 1e9;
    if (abs(i) > uR || abs(j) > uR) continue;
    // небольшой штраф за отход от прогноза: на ровном месте поле не шумит
    float cc = cost(x, c + vec2(i, j)) + 0.02 * length(vec2(i, j));
    cs[idx] = cc;
    sum += cc; cnt += 1.0;
    if (cc < best) { best = cc; bi = i; bj = j; }
  }
  vec2 d = c + vec2(bi, bj);
  int b = (bj + 3) * 7 + (bi + 3);
  if (abs(bi) < uR) {
    float l = cs[b - 1], r = cs[b + 1], den = l - 2.0 * best + r;
    if (den > 1e-5) d.x += clamp(0.5 * (l - r) / den, -0.5, 0.5);
  }
  if (abs(bj) < uR) {
    float l = cs[b - 7], r = cs[b + 7], den = l - 2.0 * best + r;
    if (den > 1e-5) d.y += clamp(0.5 * (l - r) / den, -0.5, 0.5);
  }
  // b – ошибка совпадения, a – насколько лучший сдвиг выделяется среди соседних (на ровном месте ≈ 0:
  // там любой сдвиг одинаково хорош, и поле надо брать от соседей с рисунком)
  o = vec4(d / uSize, best / 25.0, max(0.0, sum / cnt - best) / 25.0);
}`,C=`#version 300 es
precision highp float;
uniform sampler2D uF;
uniform sampler2D uI0;
uniform vec2 uSize;
uniform float uStep;
out vec4 o;
void main() {
  vec2 x = gl_FragCoord.xy;
  float l0 = texture(uI0, x / uSize).r;
  vec4 c = texture(uF, x / uSize);
  vec2 acc = vec2(0.0);
  float ws = 0.0, cs = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 q = (x + vec2(i, j) * uStep) / uSize;
    vec4 f = texture(uF, q);
    float dl = texture(uI0, q).r - l0;
    float w = exp(-float(i * i + j * j) / 4.5) * exp(-dl * dl / 0.0128) * (0.002 + f.a) / (0.02 + f.b);
    acc += f.rg * w;
    ws += w;
    cs += f.a * w;
  }
  o = vec4(acc / ws, c.b, max(c.a, 0.5 * cs / ws));
}`,G=`#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform sampler2D uNext;
uniform sampler2D uFf;
uniform sampler2D uFb;
uniform vec2 uSize;
uniform vec2 uFlowSize;
uniform float uT;
out vec4 o;
bool inside(vec2 p) { return all(greaterThanEqual(p, vec2(0.0))) && all(lessThanEqual(p, vec2(1.0))); }
float trust(float e) { return 1.0 - smoothstep(0.75, 2.5, e); }
// Вариант с опорой на точку a своего кадра (ca) и b другого (cb), e – несогласованность полей в b,
// eb – согласованность самой точки b с её собственным движением. Возвращает цвет, вес двусторонней
// выборки и вес односторонней (окклюзия: точка a видна только в своём кадре – b занята другим
// предметом, у которого своё согласованное движение; тогда берём только ca).
vec3 pick(vec3 ca, vec3 cb, bool ia, bool ib, float e, float eb, float wa, out float wBoth, out float wOne) {
  wBoth = 0.0; wOne = 0.0;
  if (!ia && !ib) return vec3(0.0);
  if (!ia || !ib) { wOne = 0.5 * trust(e); return ia ? ca : cb; }
  wBoth = trust(e) * (1.0 - smoothstep(0.12, 0.4, length(ca - cb)));
  wOne = (1.0 - trust(e)) * trust(eb) * 0.8;
  return mix(cb, ca, wa);
}
vec2 ff(vec2 p) { return texture(uFf, p).rg; }
vec2 fb(vec2 p) { return texture(uFb, p).rg; }
// Поле грубее кадра, и на границе движения вектор размыт. Уточнение на полном разрешении: из вектора
// v0 и векторов соседних клеток поля (sgn = -1 – обратное поле) берём тот, при котором prev в x − t·v
// и next в x + (1−t)·v совпадают лучше всего; на ровном месте (всё совпадает) остаётся v0.
vec2 sharpen(vec2 x, vec2 v0, float t, float sgn) {
  vec2 best = v0;
  float be = length(texture(uPrev, x - t * v0).rgb - texture(uNext, x + (1.0 - t) * v0).rgb) - 0.03;
  vec2 cell = 1.5 / uFlowSize;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    if (i == 0 && j == 0) continue;
    vec2 v = sgn * (sgn > 0.0 ? ff(x + vec2(i, j) * cell) : fb(x + vec2(i, j) * cell));
    float e = length(texture(uPrev, x - t * v).rgb - texture(uNext, x + (1.0 - t) * v).rgb);
    if (e < be) { be = e; best = v; }
  }
  return best;
}
void main() {
  vec2 x = gl_FragCoord.xy / uSize;
  float t = uT;
  // вперёд: v – движение prev→next в точке, которая к моменту t пришла в x
  vec2 v = ff(x);
  for (int i = 0; i < 4; i++) v = ff(x - t * v);
  v = sharpen(x, v, t, 1.0);
  vec2 p = x - t * v, q = x + (1.0 - t) * v;
  float eA = length((ff(p) + fb(q)) * uFlowSize), eqA = length((fb(q) + ff(q + fb(q))) * uFlowSize);
  vec3 cp = texture(uPrev, p).rgb;
  float bA, oA;
  vec3 A = pick(cp, texture(uNext, q).rgb, inside(p), inside(q), eA, eqA, 1.0 - t, bA, oA);
  // назад: u – движение next→prev
  vec2 u = fb(x);
  for (int i = 0; i < 4; i++) u = fb(x - (1.0 - t) * u);
  u = -sharpen(x, -u, t, -1.0);
  vec2 q2 = x - (1.0 - t) * u, p2 = x + t * u;
  float eB = length((fb(q2) + ff(p2)) * uFlowSize), epB = length((ff(p2) + fb(p2 + ff(p2))) * uFlowSize);
  vec3 cn = texture(uNext, q2).rgb;
  float bB, oB;
  vec3 B = pick(cn, texture(uPrev, p2).rgb, inside(q2), inside(p2), eB, epB, t, bB, oB);
  // двусторонние выборки важнее; сторона ближе по времени – немного важнее; сомнение – кросс-фейд
  vec3 fade = mix(texture(uPrev, x).rgb, texture(uNext, x).rgb, t);
  float wA = bA * bA, wB = bB * bB, wa = oA * oA * (1.0 - t), wb = oB * oB * t, wF = 0.01;
  o = vec4((A * wA + B * wB + cp * wa + cn * wb + fade * wF) / (wA + wB + wa + wb + wF), 1.0);
}`;function X(e){if(!e||typeof WebGL2RenderingContext>"u"||!(e instanceof WebGL2RenderingContext)||!e.getExtension("EXT_color_buffer_float"))return null;function m(o,u){const t=e.createShader(o);return e.shaderSource(t,u),e.compileShader(t),e.getShaderParameter(t,e.COMPILE_STATUS)?t:(console.warn("[beatcut] flow shader:",e.getShaderInfoLog(t)),null)}const b=m(e.VERTEX_SHADER,O);if(!b)return null;function a(o,u){const t=m(e.FRAGMENT_SHADER,o);if(!t)return null;const r=e.createProgram();if(e.attachShader(r,b),e.attachShader(r,t),e.linkProgram(r),!e.getProgramParameter(r,e.LINK_STATUS))return console.warn("[beatcut] flow link:",e.getProgramInfoLog(r)),null;const f={p:r};for(const c of u)f[c]=e.getUniformLocation(r,c);return f}const n={down:a(q,["uSrc","uSize","uSpread","uLuma"]),refine:a(y,["uI0","uI1","uFc","uSize","uHasC","uR"]),smooth:a(C,["uF","uI0","uSize","uStep"]),interp:a(G,["uPrev","uNext","uFf","uFb","uSize","uFlowSize","uT"])};if(Object.values(n).some(o=>!o))return null;const v=[];function d(o,u,t,r,f){const c=e.createTexture();e.bindTexture(e.TEXTURE_2D,c),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texImage2D(e.TEXTURE_2D,0,t,o,u,0,r,f,null);const w=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,w),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,c,0);const A=e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE;e.bindFramebuffer(e.FRAMEBUFFER,null);const D={tex:c,fb:w,w:o,h:u,ok:A};return v.push(D),D}const l=(o,u)=>d(o,u,e.R8,e.RED,e.UNSIGNED_BYTE),x=(o,u)=>d(o,u,e.RGBA16F,e.RGBA,e.HALF_FLOAT);let p=0,T=0,s=[],i=null,h=null,E=!1;function z(){for(const o of v)e.deleteTexture(o.tex),e.deleteFramebuffer(o.fb);v.length=0,i=null,h=null}function H(o,u){z(),p=o,T=u,s=B(o,u),i={I:[s.map(t=>l(t[0],t[1])),s.map(t=>l(t[0],t[1]))],F:[s.map(t=>x(t[0],t[1])),s.map(t=>x(t[0],t[1]))],T:s.map(t=>x(t[0],t[1])),U:s.map(t=>x(t[0],t[1]))},h=d(o,u,e.RGBA8,e.RGBA,e.UNSIGNED_BYTE),E=v.some(t=>!t.ok),E&&console.warn("[beatcut] flow: framebuffer неполный – плавность по движению выключена")}function F(o,u,t){e.bindFramebuffer(e.FRAMEBUFFER,o.fb),e.viewport(0,0,o.w,o.h),e.useProgram(u.p);let r=0;for(const[f,c]of t)e.activeTexture(e.TEXTURE0+r),e.bindTexture(e.TEXTURE_2D,c),e.uniform1i(u[f],r++);e.drawArrays(e.TRIANGLES,0,3)}function j(o,u){const t=n.down;e.useProgram(t.p),e.uniform1f(t.uLuma,1),e.uniform1f(t.uSpread,.25),e.uniform2f(t.uSize,u[0].w,u[0].h),F(u[0],t,[["uSrc",o]]);for(let r=1;r<u.length;r++)e.useProgram(t.p),e.uniform1f(t.uLuma,0),e.uniform1f(t.uSpread,.5),e.uniform2f(t.uSize,u[r].w,u[r].h),F(u[r],t,[["uSrc",u[r-1].tex]])}function M(o,u,t){for(let r=s.length-1;r>=0;r--){const f=r<s.length-1;e.useProgram(n.refine.p),e.uniform2f(n.refine.uSize,s[r][0],s[r][1]),e.uniform1f(n.refine.uHasC,f?1:0),e.uniform1i(n.refine.uR,f?2:3),F(i.T[r],n.refine,[["uI0",o[r].tex],["uI1",u[r].tex],["uFc",f?t[r+1].tex:o[r].tex]]),e.useProgram(n.smooth.p),e.uniform2f(n.smooth.uSize,s[r][0],s[r][1]),e.uniform1f(n.smooth.uStep,2),F(i.U[r],n.smooth,[["uF",i.T[r].tex],["uI0",o[r].tex]]),e.useProgram(n.smooth.p),e.uniform1f(n.smooth.uStep,1),F(t[r],n.smooth,[["uF",i.U[r].tex],["uI0",o[r].tex]])}}let S=null;const R={computed:0,ms:0};return{stats:R,get sizes(){return s},compute(o,u,t,r,f,c){if((t!==p||r!==T||!i)&&(H(t,r),S=null),E)return!1;if(f!=null&&f===S)return!0;const w=performance.now();if(j(o,i.I[0]),j(u,i.I[1]),M(i.I[0],i.I[1],i.F[0]),M(i.I[1],i.I[0],i.F[1]),c){const A=new Float32Array(4);e.readPixels(0,0,1,1,e.RGBA,e.FLOAT,A)}return e.bindFramebuffer(e.FRAMEBUFFER,null),S=f,R.computed++,R.ms=performance.now()-w,!0},interpolate(o,u,t){if(E||!i)return null;const r=n.interp;return e.useProgram(r.p),e.uniform2f(r.uSize,p,T),e.uniform2f(r.uFlowSize,s[0][0],s[0][1]),e.uniform1f(r.uT,t),F(h,r,[["uPrev",o],["uNext",u],["uFf",i.F[0][0].tex],["uFb",i.F[1][0].tex]]),e.bindFramebuffer(e.FRAMEBUFFER,null),h.tex},invalidate(){S=null},read(o=0,u=0){const t=i.F[u][o],r=new Float32Array(t.w*t.h*4);e.bindFramebuffer(e.FRAMEBUFFER,t.fb),e.readPixels(0,0,t.w,t.h,e.RGBA,e.FLOAT,r),e.bindFramebuffer(e.FRAMEBUFFER,null);const f=new Float32Array(t.w*t.h*3);for(let c=0;c<t.w*t.h;c++)f[c*3]=r[c*4]*t.w,f[c*3+1]=r[c*4+1]*t.h,f[c*3+2]=r[c*4+2];return{w:t.w,h:t.h,data:f}},destroy(){z();for(const o of Object.values(n))e.deleteProgram(o.p);e.deleteShader(b)}}}const P=Object.assign({createFlow:X},k);L.beatcutFlow=P,typeof module<"u"&&(module.exports=P)})(typeof self<"u"?self:globalThis);
