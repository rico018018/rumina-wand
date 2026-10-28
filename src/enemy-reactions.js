/** Additive, time-bounded reactions. Does not change game state or revive a fallen enemy. */
export const PROP_REACTIONS={
 accio:{name:'宝箱を目で追い、手を伸ばす',turn:-.55,lean:.10,arm:-.65,spread:.12,step:.12},
 reducto:{name:'破片を避けて屈み、頭を守る',turn:.28,lean:.48,arm:-1.5,spread:.38,step:-.42,duck:.12},
 protego:{name:'盾に驚いて両手を上げる',turn:0,lean:-.16,arm:-.85,spread:.4,step:-.12},
 serpensortia:{name:'ヘビに驚いて身を引く',turn:.5,lean:-.24,arm:-.95,spread:.5,step:-.45},
 vipera_evanesca:{name:'消えた場所を見て、安堵して手を下ろす',turn:.48,lean:.12,arm:-.38,spread:.18,step:-.1},
 finite_incantatem:{name:'左右を見回して驚く',turn:.4,lean:-.1,arm:-.6,spread:.32,step:.1},
};
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function reactionPose(id,elapsed,standing=true){
 const cfg=PROP_REACTIONS[id];if(!cfg||elapsed<0||elapsed>=2800)return null;
 const w=smooth(elapsed/240)*(1-smooth((elapsed-1400)/1400));
 return {weight:w,turn:cfg.turn*w*(id==='finite_incantatem'?Math.sin(elapsed/330):1),lean:standing?cfg.lean*w:0,arm:cfg.arm*w,spread:cfg.spread*w,step:standing?cfg.step*w:0,duck:standing?(cfg.duck||0)*w:0};
}
export function applyReaction(actor,pose){
 if(!pose)return;
 actor.root.position.x+=pose.step;actor.root.rotation.x+=pose.lean;
 actor.head.rotation.y+=pose.turn;actor.head.rotation.x+=pose.duck;actor.head.position.y-=pose.duck;
 for(const [side,arm] of [[-1,actor.arms.left],[1,actor.arms.right]]){arm.rotation.x+=pose.arm;arm.rotation.z+=side*pose.spread;}
}
