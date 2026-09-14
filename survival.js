'use strict';
const resourceLabels={wood:'🪵 خشب',stone:'🪨 حجر',fiber:'🌿 ألياف',rawMeat:'🥩 لحم نيئ',food:'🍗 لحم مطبوخ'};
const buildRecipes={floor:{label:'أرضية',cost:{wood:6,fiber:2}},wall:{label:'جدار',cost:{wood:5,fiber:2}},door:{label:'باب بإطار',cost:{wood:6,fiber:2}},roof:{label:'سقف',cost:{wood:6,fiber:3}},campfire:{label:'نار للطبخ',cost:{wood:5,stone:3}}};
const toolRecipes=[{label:'فأس حجري',cost:{wood:4,stone:3,fiber:2},detail:'ضربتان من قوة اليد، وقطع أسرع.'},{label:'فأس حجري مطوّر',cost:{wood:8,stone:8,fiber:4},detail:'ثلاثة أضعاف قوة اليد، وأسرع في جمع الخشب.'}];
const resourceNodes=[],collectedResources=new Set();
let panelMode=null,cookingFire=null,buildMode=null,buildRotation=0,ghost=null,placement=null,actionCooldown=0;
const panel=document.createElement('div');panel.id='survival-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','survival-title');document.body.appendChild(panel);
const buildStatus=document.createElement('div');buildStatus.id='build-status';document.body.appendChild(buildStatus);
const toolStatus=document.createElement('div');toolStatus.id='tool-status';document.body.appendChild(toolStatus);
const shortcuts=document.createElement('div');shortcuts.id='survival-shortcuts';shortcuts.innerHTML='<button id="bag-button">Tab · الحقيبة</button><button id="build-button">B · البناء</button>';document.body.appendChild(shortcuts);
document.getElementById('bag-button').onclick=()=>openSurvivalPanel('inventory');document.getElementById('build-button').onclick=()=>openSurvivalPanel('build');
const originalHeightAt=heightAt;
heightAt=function(x,z){let h=originalHeightAt(x,z);if(h===null)return null;for(const s of structures)if(s.type==='floor'&&Math.abs(x-s.pos.x)<1.5&&Math.abs(z-s.pos.z)<1.5)h=Math.max(h,s.pos.y+0.18);return h;};
const woodMaterial=new THREE.MeshStandardMaterial({color:0x725132,roughness:.94}),darkWoodMaterial=new THREE.MeshStandardMaterial({color:0x3d2b1c,roughness:1}),ropeMaterial=new THREE.MeshStandardMaterial({color:0xb5a077,roughness:1});
function addBox(group,w,h,d,x,y,z,material=woodMaterial){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;}
function createPiece(type){const g=new THREE.Group();
 if(type==='floor'){for(let i=0;i<10;i++)addBox(g,.29,.18,3,-1.35+i*.3,.09,0);for(const x of [-1.3,1.3])for(const z of [-1.3,1.3])addBox(g,.14,.65,.14,x,-.15,z,darkWoodMaterial);}
 if(type==='wall'){for(let i=0;i<10;i++)addBox(g,.29,2.5,.16,-1.35+i*.3,1.25,0);for(const y of [.3,2.15])addBox(g,3,.15,.22,0,y,0,darkWoodMaterial);}
 if(type==='door'){for(const x of [-1.3,1.3])addBox(g,.4,2.5,.2,x,1.25,0);addBox(g,3,.3,.2,0,2.35,0);const hinge=new THREE.Group();hinge.position.set(-1.1,0,0);g.add(hinge);for(let i=0;i<7;i++)addBox(hinge,.30,2.18,.12,.16+i*.31,1.09,0);addBox(hinge,.08,.1,.13,1.95,1.1,.13,ropeMaterial);g.userData.hinge=hinge;}
 if(type==='roof'){for(const sign of [-1,1]){const slope=addBox(g,3.3,.18,1.85,0,.35,sign*.8,darkWoodMaterial);slope.rotation.x=sign*.42;}for(const x of [-1.35,1.35])addBox(g,.13,.7,.13,x,.25,0);}
 if(type==='campfire'){for(let i=0;i<8;i++){const stone=new THREE.Mesh(new THREE.DodecahedronGeometry(.17,0),new THREE.MeshStandardMaterial({color:0x66645d,roughness:1}));stone.position.set(Math.cos(i*Math.PI/4)*.55,.1,Math.sin(i*Math.PI/4)*.55);g.add(stone);}for(const r of [-.65,.65]){const log=addBox(g,.85,.16,.17,0,.17,0,darkWoodMaterial);log.rotation.y=r;}const flame=new THREE.Mesh(new THREE.ConeGeometry(.22,.7,7),new THREE.MeshStandardMaterial({color:0xffb43e,emissive:0xee5510,emissiveIntensity:1.6}));flame.position.y=.52;g.add(flame);g.userData.flame=flame;const light=new THREE.PointLight(0xffa040,1.4,9,2);light.position.y=.7;g.add(light);g.userData.light=light;}
 return g;
}
function affordable(cost){return Object.entries(cost).every(([key,n])=>state[key]>=n);}
function pay(cost){if(!affordable(cost))return false;for(const [k,n]of Object.entries(cost))state[k]-=n;return true;}
function costText(cost){return Object.entries(cost).map(([k,n])=>`${n} ${resourceLabels[k]}`).join(' · ');}
function refreshTool(){toolStatus.textContent=state.tool===2?'🪓 فأس مطوّر':state.tool===1?'🪓 فأس حجري':'✋ جمع باليد — اصنع فأسًا من الحقيبة';axeHead.material.color.setHex(state.tool===2?0xaebac2:0x797c76);}
function cancelBuild(){buildMode=null;placement=null;if(ghost){scene.remove(ghost);ghost.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});ghost=null;}buildStatus.style.display='none';}
window.closeSurvivalPanel=function(relock=true){if(!panelMode)return;panelMode=null;cookingFire=null;panel.style.display='none';settingsOpen=false;for(const k in keys)keys[k]=false;if(relock&&state.started&&!state.gameOver)lockMouse();};
const originalOpenSettings=openSettings;openSettings=function(){closeSurvivalPanel(false);cancelBuild();originalOpenSettings();};
function openSurvivalPanel(mode,fire=null){if(!state.started||state.gameOver)return;cancelBuild();panelMode=mode;cookingFire=fire;settingsOpen=true;for(const k in keys)keys[k]=false;document.exitPointerLock();ui.prompt.style.opacity='0';document.getElementById('settings').style.display='none';panel.style.display='flex';renderPanel();panel.querySelector('button').focus();}
function renderPanel(message=''){
 const title=panelMode==='build'?'بناء المخيم':panelMode==='cook'?'الطبخ على النار':'الحقيبة وصناعة الأدوات';
 const inventory=Object.entries(resourceLabels).map(([k,label])=>`<div class="inventory-item">${label}<strong>${state[k]}</strong></div>`).join('');
 let content='';
 if(panelMode==='inventory')content='<h3>صناعة الأدوات</h3><div class="recipe-grid">'+toolRecipes.map((r,i)=>`<article class="recipe-card"><h3>${r.label}</h3><p>${r.detail}<br>${costText(r.cost)}</p><button data-craft="${i+1}" ${state.tool>=i+1||state.tool<i||!affordable(r.cost)?'disabled':''}>${state.tool>=i+1?'تمت الصناعة':i===1&&state.tool<1?'اصنع الفأس الحجري أولًا':'اصنع الأداة'}</button></article>`).join('')+'</div><p class="survival-subtitle">E لجمع الحجر والألياف وقطع الأشجار. F لأكل اللحم المطبوخ. يمكن جمع الخشب باليد حتى تصنع الفأس.</p>';
 if(panelMode==='build')content='<p class="survival-subtitle">ابدأ بأرضية، ثم أضف الجدران والباب والسقف. بعد الاختيار: حرّك المعاينة بالنظر، R للتدوير، نقرة للتثبيت، وEsc للإلغاء.</p><div class="recipe-grid">'+Object.entries(buildRecipes).map(([key,r])=>`<article class="recipe-card"><h3>${r.label}</h3><p>${costText(r.cost)}</p><button data-build="${key}">معاينة ${r.label}</button></article>`).join('')+'</div>';
 if(panelMode==='cook'){const fire=cookingFire;content=`<p class="survival-subtitle">كل قطعة تحتاج لحمًا نيئًا واحدًا وخشبة واحدة، وتستغرق 6 ثوانٍ أثناء اللعب. يمكنك الابتعاد والعودة لجمع الطعام.</p><p>على النار: ${fire.queue.length} · جاهز للجمع: ${fire.ready}</p><div class="recipe-grid"><button data-cook ${state.rawMeat<1||state.wood<1||fire.queue.length>=5?'disabled':''}>ضع لحمًا على النار · 1 خشب</button><button data-collect ${fire.ready<1?'disabled':''}>اجمع اللحم المطبوخ (${fire.ready})</button></div>`;}
 panel.innerHTML=`<section class="survival-window"><div class="survival-head"><h2 id="survival-title">${title}</h2><button id="survival-close">إغلاق · Esc</button></div><p class="survival-subtitle">اللعبة متوقفة أثناء فتح القائمة</p><div class="resource-grid">${inventory}</div>${content}<div class="survival-message" role="status">${message}</div></section>`;
 document.getElementById('survival-close').onclick=()=>closeSurvivalPanel();
 for(const b of panel.querySelectorAll('[data-craft]'))b.onclick=()=>{const ok=craftTool(Number(b.dataset.craft));renderPanel(ok?'تمت صناعة الأداة وتجهيزها':'الموارد غير كافية');};
 for(const b of panel.querySelectorAll('[data-build]'))b.onclick=()=>startBuild(b.dataset.build);
 const cook=panel.querySelector('[data-cook]');if(cook)cook.onclick=()=>{queueCooking(cookingFire);renderPanel('أُضيف اللحم — أغلق القائمة ليستمر الطبخ');};
 const collect=panel.querySelector('[data-collect]');if(collect)collect.onclick=()=>{collectCooking(cookingFire);renderPanel('أُضيف الطعام إلى حقيبتك');};
}
function craftTool(tier){if(tier!==state.tool+1||!toolRecipes[tier-1]||!pay(toolRecipes[tier-1].cost))return false;state.tool=tier;refreshTool();Audio.build();saveGame();return true;}
function queueCooking(fire){if(!fire||fire.type!=='campfire'||fire.queue.length>=5||!pay({rawMeat:1,wood:1}))return false;fire.queue.push(6);saveGame();return true;}
function collectCooking(fire){if(!fire||!fire.ready)return false;state.food+=fire.ready;fire.ready=0;Audio.eat();saveGame();return true;}
function startBuild(type){if(!buildRecipes[type])return;closeSurvivalPanel();cancelBuild();buildMode=type;buildRotation=0;ghost=createPiece(type);const lights=[];ghost.traverse(o=>{if(o.isLight)lights.push(o);if(o.isMesh){o.material=new THREE.MeshBasicMaterial({color:0x64e79d,transparent:true,opacity:.38,depthWrite:false});o.castShadow=false;o.receiveShadow=false;}});lights.forEach(o=>o.parent.remove(o));scene.add(ghost);buildStatus.style.display='block';updatePlacement();}
function placementFor(type,rotation=buildRotation){
 const target=new THREE.Vector3(player.pos.x-Math.sin(player.yaw)*3.8,0,player.pos.z-Math.cos(player.yaw)*3.8);let x=target.x,z=target.z,y=originalHeightAt(x,z),r=rotation,reason='';
 if(type==='floor'){x=Math.round(x/3)*3;z=Math.round(z/3)*3;const heights=[[-1.5,-1.5],[-1.5,1.5],[1.5,-1.5],[1.5,1.5],[0,0]].map(([dx,dz])=>originalHeightAt(x+dx,z+dz));if(heights.some(h=>h===null))reason='خارج حدود الأرض';else{y=Math.max(...heights)+.02;if(Math.max(...heights)-Math.min(...heights)>.5)reason='الأرض شديدة الميل';}if(structures.some(s=>s.type==='floor'&&Math.hypot(s.pos.x-x,s.pos.z-z)<2.9))reason='توجد أرضية هنا';}
 else if(['wall','door','roof'].includes(type)){const floor=structures.filter(s=>s.type==='floor').sort((a,b)=>a.pos.distanceTo(new THREE.Vector3(x,a.pos.y,z))-b.pos.distanceTo(new THREE.Vector3(x,b.pos.y,z)))[0];
  if(!floor||Math.hypot(floor.pos.x-x,floor.pos.z-z)>4)reason='تحتاج أرضية قريبة أولًا';else{x=floor.pos.x;z=floor.pos.z;y=floor.pos.y+.18;if(type==='roof'){y+=2.5;}else{x+=Math.sin(r)*1.5;z+=Math.cos(r)*1.5;}if(structures.some(s=>['wall','door','roof'].includes(s.type)&&((type==='roof')===(s.type==='roof'))&&Math.hypot(s.pos.x-x,s.pos.z-z)<.2))reason='المكان مشغول بقطعة أخرى';}
 }else{const heights=[[-.65,0],[.65,0],[0,-.65],[0,.65]].map(([dx,dz])=>heightAt(x+dx,z+dz));y=heightAt(x,z);if(y===null||heights.some(h=>h===null||Math.abs(h-y)>.35))reason='اختر أرضًا مستوية للنار';if(structures.some(s=>['campfire','shelter'].includes(s.type)&&Math.hypot(s.pos.x-x,s.pos.z-z)<1.6))reason='توجد قطعة هنا';}
 if(y===null)reason='خارج حدود الخريطة';
 const radius=type==='floor'?1.9:type==='campfire'?1:.45;if(obstacles.some(o=>Math.hypot(o.pos.x-x,o.pos.z-z)<o.radius+radius))reason='توجد شجرة أو عائق';
 if(Math.hypot(player.pos.x-x,player.pos.z-z)<(type==='floor'?1.8:.9)&&type!=='roof')reason='ابتعد قليلًا عن مكان البناء';
 if(!affordable(buildRecipes[type].cost))reason='الموارد غير كافية';
 return {type,x,z,y:y??0,rotation:r,valid:!reason,reason};
}
function updatePlacement(){if(!buildMode||!ghost)return;placement=placementFor(buildMode);ghost.position.set(placement.x,placement.y,placement.z);ghost.rotation.y=placement.rotation;ghost.traverse(o=>{if(o.isMesh)o.material.color.setHex(placement.valid?0x57eba0:0xf65c52);});buildStatus.style.borderColor=placement.valid?'#57eba0':'#f65c52';buildStatus.textContent=`${buildRecipes[buildMode].label} · ${costText(buildRecipes[buildMode].cost)}\n${placement.valid?'نقرة للتثبيت':placement.reason} · R تدوير · B قائمة · Esc إلغاء`;}
function restoreBuild(record){if(!record||!Number.isFinite(record.x)||!Number.isFinite(record.z)||originalHeightAt(record.x,record.z)===null)return null;if(record.type==='shelter'){forcePlaceStructure('shelter',record.x,record.z);return structures[structures.length-1];}if(!buildRecipes[record.type])return null;
 const mesh=createPiece(record.type),pos=new THREE.Vector3(record.x,Number.isFinite(record.y)?record.y:heightAt(record.x,record.z),record.z);mesh.position.copy(pos);mesh.rotation.y=record.rotation||0;scene.add(mesh);
 const s={type:record.type,pos,mesh,rotation:record.rotation||0,open:!!record.open,light:mesh.userData.light,queue:(Array.isArray(record.queue)?record.queue:[]).filter(n=>Number.isFinite(n)&&n>0&&n<=6).slice(0,5),ready:Number.isFinite(record.ready)?Math.max(0,Math.floor(record.ready)):0};if(s.type==='door'&&s.open)mesh.userData.hinge.rotation.y=-Math.PI/2;structures.push(s);return s;
}
function placeBuild(){if(!buildMode)return false;const p=placementFor(buildMode);if(!p.valid){showFeedback(p.reason);return false;}if(!pay(buildRecipes[buildMode].cost))return false;restoreBuild(p);Audio.build();showFeedback('تم بناء '+buildRecipes[buildMode].label);saveGame();updatePlacement();return true;}
window.isWorldBlocked=function(x,z){if(obstacles.some(o=>Math.hypot(o.pos.x-x,o.pos.z-z)<o.radius+player.radius))return true;for(const s of structures){const dx=x-s.pos.x,dz=z-s.pos.z,lx=dx*Math.cos(s.rotation)-dz*Math.sin(s.rotation),lz=dx*Math.sin(s.rotation)+dz*Math.cos(s.rotation);if(['wall','door'].includes(s.type)&&Math.abs(lx)<1.5+player.radius&&Math.abs(lz)<.13+player.radius){if(s.type==='wall'||!s.open||Math.abs(lx)>.82)return true;}if(s.type==='campfire'&&Math.hypot(dx,dz)<.7+player.radius)return true;}return false;};
function nearestAction(){let best=null,dist=3;const consider=(type,obj)=>{const d=Math.hypot(obj.pos.x-player.pos.x,obj.pos.z-player.pos.z);if(d<dist&&Math.abs(obj.pos.y-(player.pos.y-1.7))<2.4){best={type,obj};dist=d;}};for(const n of resourceNodes)if(!n.collected)consider(n.kind,n);for(const s of structures)if(['campfire','door'].includes(s.type))consider(s.type,s);for(const t of trees)if(!t.chopped)consider('tree',t);for(const a of animals)consider('animal',a);return best;}
function interact(){if(actionCooldown>0)return false;const hit=nearestAction();if(!hit)return false;const o=hit.obj;
 if(['stone','fiber','wood'].includes(hit.type)){state[hit.type]+=o.amount;o.collected=true;collectedResources.add(o.id);o.mesh.visible=false;Audio.chop();showFeedback('+'+o.amount+' '+resourceLabels[hit.type]);actionCooldown=.25;saveGame();}
 else if(hit.type==='tree'){chopTree(o);actionCooldown=state.tool===2?.35:state.tool===1?.65:1.05;}
 else if(hit.type==='animal'){huntAnimal(o);axeSwing=.25;actionCooldown=.7;}
 else if(hit.type==='campfire')openSurvivalPanel('cook',o);
 else if(hit.type==='door'){o.open=!o.open;o.mesh.userData.hinge.rotation.y=o.open?-Math.PI/2:0;Audio.build();actionCooldown=.25;saveGame();}return true;
}
function eatCooked(){if(state.food<1){showFeedback(state.rawMeat?'اللحم نيئ — اطبخه على النار أولًا':'لا يوجد طعام مطبوخ');return false;}if(state.hunger<5&&state.energy>=95){showFeedback('لست بحاجة للطعام الآن');return false;}state.food--;state.hunger=Math.max(0,state.hunger-45);state.energy=Math.min(100,state.energy+15);Audio.eat();showFeedback('أكلت لحمًا مطبوخًا');saveGame();return true;}
function initializeSurvival(){if(resourceNodes.length)return;for(const t of trees){t.hp=6;t.maxHp=6;}const rand=mulberry32(994211);for(let i=0;i<390;i++){const kind=i<120?'stone':i<240?'fiber':'wood';let pos=null;for(let a=0;a<50;a++){const x=mapBounds.minX+2+rand()*(mapBounds.maxX-mapBounds.minX-4),z=mapBounds.minZ+2+rand()*(mapBounds.maxZ-mapBounds.minZ-4),y=originalHeightAt(x,z);if(y!==null&&!obstacles.some(o=>Math.hypot(o.pos.x-x,o.pos.z-z)<o.radius+.65)){pos=new THREE.Vector3(x,y,z);break;}}if(!pos)continue;const g=new THREE.Group();if(kind==='stone'){for(let j=0;j<3;j++){const m=new THREE.Mesh(new THREE.DodecahedronGeometry(.25+rand()*.16,0),new THREE.MeshStandardMaterial({color:0x8297a3,roughness:.9}));m.scale.y=.65;m.position.set((rand()-.5)*.5,.16,(rand()-.5)*.5);m.castShadow=true;g.add(m);}}
 else if(kind==='fiber'){for(let j=0;j<5;j++){const stem=addBox(g,.025,.6,.025,(rand()-.5)*.35,.3,(rand()-.5)*.35,new THREE.MeshStandardMaterial({color:0x809246}));const leaf=new THREE.Mesh(new THREE.ConeGeometry(.1,.24,4),new THREE.MeshStandardMaterial({color:0xc7be69,roughness:1}));leaf.position.copy(stem.position);leaf.position.y=.65;g.add(leaf);}}
 else for(let j=0;j<3;j++){const stick=addBox(g,.07,.07,.75,(rand()-.5)*.3,.08,(rand()-.5)*.3);stick.rotation.y=rand()*3;}
 g.position.copy(pos);scene.add(g);resourceNodes.push({id:i,kind,pos,mesh:g,collected:false,amount:kind==='fiber'?3:2});}refreshTool();}
function restoreCollected(ids){for(const id of ids){const n=resourceNodes.find(n=>n.id===id);if(n){n.collected=true;n.mesh.visible=false;collectedResources.add(id);}}}
window.updateSurvivalSystems=function(dt){actionCooldown=Math.max(0,actionCooldown-dt);for(const fire of structures){if(fire.type!=='campfire'||!fire.queue.length)continue;fire.queue[0]-=dt;if(fire.queue[0]<=0){fire.queue.shift();fire.ready++;if(Math.hypot(fire.pos.x-player.pos.x,fire.pos.z-player.pos.z)<8)showFeedback('اللحم جاهز — E عند النار لجمعه');}}updatePlacement();};
const originalSyncUI=syncUI;syncUI=function(){originalSyncUI();refreshTool();shortcuts.style.display=state.started&&!state.gameOver?'flex':'none';toolStatus.style.display=state.started?'block':'none';ui.buildHint.style.opacity='0';if(!state.started||state.gameOver||settingsOpen||buildMode){ui.prompt.style.opacity='0';return;}const hit=nearestAction();if(hit){const labels={stone:'E — جمع الحجر',fiber:'E — جمع الألياف',wood:'E — جمع الخشب',tree:'E — قطع الشجرة',animal:'E — صيد · يعطي لحمًا نيئًا',campfire:'E — الطبخ وجمع الطعام',door:hit.obj.open?'E — إغلاق الباب':'E — فتح الباب'};ui.prompt.textContent=labels[hit.type];ui.prompt.style.opacity='1';}else{ui.prompt.style.opacity='0';}};
window.addEventListener('keydown',e=>{if(!['Tab','KeyB','KeyE','KeyF','KeyR','Escape','Digit1','Digit2'].includes(e.code))return;if(!state.started||state.gameOver)return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
 if(e.code==='Tab'){panelMode==='inventory'?closeSurvivalPanel():openSurvivalPanel('inventory');return;}
 if(e.code==='KeyB'){panelMode==='build'?closeSurvivalPanel():openSurvivalPanel('build');return;}
 if(e.code==='Escape'){if(panelMode)closeSurvivalPanel();else if(buildMode)cancelBuild();return;}
 if(settingsOpen)return;
 if(e.code==='KeyR'&&buildMode){buildRotation=(buildRotation+Math.PI/2)%(Math.PI*2);updatePlacement();return;}
 if(buildMode)return;
 if(e.code==='KeyE')interact();if(e.code==='KeyF')eatCooked();if(e.code==='Digit1')startBuild('campfire');if(e.code==='Digit2')openSurvivalPanel('build');
},true);
renderer.domElement.addEventListener('click',e=>{if(buildMode&&!settingsOpen&&pointerLocked){e.preventDefault();e.stopImmediatePropagation();placeBuild();}},true);
refreshTool();

if(forestReady)initializeSurvival();


