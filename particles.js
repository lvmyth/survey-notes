const c=document.getElementById('particleCanvas'),x=c.getContext('2d');
let W,H,ps=[],m={x:-9999,y:-9999};
const isMobile=innerWidth<768;
const CF={count:isMobile?40:120,speed:isMobile?0.15:0.25,cDist:isMobile?80:110,mR:isMobile?100:160};
function rs(){W=c.width=innerWidth;H=c.height=innerHeight}
class P{
  constructor(){this.rr()}
  rr(){this.x=Math.random()*W;this.y=Math.random()*H;this.vx=(Math.random()-0.5)*CF.speed*2;this.vy=(Math.random()-0.5)*CF.speed*2;this.r=Math.random()*1.8+0.6}
  up(){this.x+=this.vx;this.y+=this.vy;if(this.x<0||this.x>W)this.vx*=-1;if(this.y<0||this.y>H)this.vy*=-1}
  dr(){x.beginPath();x.arc(this.x,this.y,this.r,0,Math.PI*2);x.fillStyle='rgba(44,110,73,0.35)';x.fill()}
}
function ln(){
  const dS=CF.cDist*CF.cDist;
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const dx=ps[i].x-ps[j].x,dy=ps[i].y-ps[j].y,d2=dx*dx+dy*dy;if(d2<dS){const a=(1-d2/dS)*0.4;x.beginPath();x.moveTo(ps[i].x,ps[i].y);x.lineTo(ps[j].x,ps[j].y);x.strokeStyle='rgba(44,110,73,'+a.toFixed(3)+')';x.lineWidth=0.5;x.stroke()}}
  if(m.x>0){const mR2=CF.mR*CF.mR;for(const p of ps){const dx=p.x-m.x,dy=p.y-m.y,d2=dx*dx+dy*dy;if(d2<mR2){const a=(1-d2/mR2)*0.7;x.beginPath();x.moveTo(p.x,p.y);x.lineTo(m.x,m.y);x.strokeStyle='rgba(76,150,108,'+a.toFixed(3)+')';x.lineWidth=1;x.stroke()}}}
}
function an(){x.clearRect(0,0,W,H);for(const p of ps){p.up();p.dr()}ln();requestAnimationFrame(an)}
rs();ps=[];for(let i=0;i<CF.count;i++)ps.push(new P());
addEventListener('resize',()=>{rs();for(const p of ps)p.rr()});
addEventListener('mousemove',e=>{m.x=e.clientX;m.y=e.clientY});
addEventListener('mouseleave',()=>{m.x=-9999;m.y=-9999});
addEventListener('touchmove',e=>{const t=e.touches[0];if(t){m.x=t.clientX;m.y=t.clientY}},{passive:true});
addEventListener('touchend',()=>{m.x=-9999;m.y=-9999});
an();
