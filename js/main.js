(() => {
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdde7ff);
  scene.fog = new THREE.Fog(0xdde7ff, 50, 200);

  const renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 500);

  // Player carrier
  const player = new THREE.Object3D();
  player.position.set(0, 8, 20);
  player.add(camera);
  scene.add(player);

  // Pointer lock desktop
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');

  let isPointerLocked = false;
  let yaw = 0;
  let pitch = 0;
  const yawPitchEuler = new THREE.Euler(0,0,0,'YXZ');
  const PI_2 = Math.PI / 2;

  startBtn.addEventListener('click', () => {
    if (isTouchDevice) {
      overlay.style.display = 'none';
    } else {
      renderer.domElement.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === renderer.domElement;
    if (isPointerLocked) overlay.style.display = 'none';
    else if (!isTouchDevice) overlay.style.display = 'flex';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPointerLocked) return;
    if (inventoryOpen) return;
    const sensitivity = 0.0025;
    yaw   -= e.movementX * sensitivity;
    pitch -= e.movementY * sensitivity;
    pitch = Math.max(-PI_2 + 0.1, Math.min(PI_2 - 0.1, pitch));
    yawPitchEuler.set(pitch, yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(yawPitchEuler);
  });

  // Lights
  scene.add(new THREE.HemisphereLight(0xe6f0ff, 0x99b08f, 0.8));

  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(40, 80, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun);

  const farGround = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ color: 0xb7c9a6, roughness: 1 })
  );
  farGround.rotation.x = -Math.PI/2;
  farGround.position.y = -10;
  farGround.receiveShadow = true;
  scene.add(farGround);

  // ===== Blocks =====
  const blockTypes = [
    { id: 0, name: "Трава",      color: 0x7bcf7b, rough: 0.9,  metal: 0.0 },
    { id: 1, name: "Земля",      color: 0x9d6645, rough: 1.0,  metal: 0.0 },
    { id: 2, name: "Камень",     color: 0x9096a3, rough: 0.8,  metal: 0.1 },
    { id: 3, name: "Песок",      color: 0xefe0b4, rough: 0.95, metal: 0.0 },
    { id: 4, name: "Доски",      color: 0xc3925b, rough: 0.7,  metal: 0.05 },
    { id: 5, name: "Листва",     color: 0x4a9155, rough: 0.9,  metal: 0.0, alpha: 0.95 },
    { id: 6, name: "Гранит",     color: 0xbf7b69, rough: 0.75, metal: 0.18 },
    { id: 7, name: "Руда",       color: 0x8f93a5, rough: 0.65, metal: 0.35, emissive: 0x4458ff, emissiveIntensity: 0.3 },
    { id: 8, name: "Светящийся", color: 0xfaf5d0, rough: 0.15, metal: 0.2,  emissive: 0xfff2b0, emissiveIntensity: 0.9 },
    { id: 9, name: "Вода",       color: 0x3a84f0, rough: 0.15, metal: 0.0, transparent: true, opacity: 0.55, isWater: true }
  ];

  const blockMaterials = {};
  for (const t of blockTypes) {
    const mat = new THREE.MeshStandardMaterial({
      color: t.color,
      roughness: t.rough,
      metalness: t.metal,
      emissive: t.emissive || 0x000000,
      emissiveIntensity: t.emissiveIntensity || 0,
      transparent: !!t.transparent,
      opacity: t.opacity || 1
    });
    blockMaterials[t.id] = mat;
  }

  const blockGeo = new THREE.BoxGeometry(1,1,1);
  const worldBlocks = new Map(); // key "x,y,z" -> mesh
  function keyFromXYZ(x,y,z){ return x + "," + y + "," + z; }

  function addBlock(x,y,z,blockId) {
    const key = keyFromXYZ(x,y,z);
    if (worldBlocks.has(key)) return false;
    const mat = blockMaterials[blockId] || blockMaterials[1];
    const mesh = new THREE.Mesh(blockGeo, mat);
    mesh.position.set(x+0.5, y+0.5, z+0.5);
    mesh.castShadow = !blockTypes[blockId]?.isWater;
    mesh.receiveShadow = true;
    mesh.userData.blockId = blockId;
    scene.add(mesh);
    worldBlocks.set(key, mesh);
    return true;
  }

  function removeBlock(x,y,z){
    const key = keyFromXYZ(x,y,z);
    const m = worldBlocks.get(key);
    if(!m) return null;
    const id = m.userData.blockId;
    scene.remove(m);
    worldBlocks.delete(key);
    return id;
  }

  // ===== Inventory logic =====
  const invCounts = new Map(); // blockId -> count
  function getCount(id){ return invCounts.get(id) ?? 0; }
  function setCount(id, v){ invCounts.set(id, Math.max(0, Math.floor(v))); }
  function addToInv(id, delta){ setCount(id, getCount(id) + delta); }
  function canSpend(id, delta){ return getCount(id) >= delta; }
  function spend(id, delta){
    if(!canSpend(id, delta)) return false;
    setCount(id, getCount(id) - delta);
    return true;
  }

  // Стартовый набор (чтобы можно было строить сразу)
  for (const t of blockTypes) {
    // воды меньше, остального больше
    setCount(t.id, t.isWater ? 64 : 256);
  }

  // ===== World generation =====
  const WORLD_SIZE = 32;
  const HALF = WORLD_SIZE/2;
  function noise2d(x,z){
    const s = Math.sin(x*127.1 + z*311.7)*43758.5453;
    return s - Math.floor(s);
  }

  for(let x=-HALF; x<HALF; x++){
    for(let z=-HALF; z<HALF; z++){
      const hBase = 4 + Math.floor(noise2d(x*0.3, z*0.3)*5);
      for(let y=0; y<hBase; y++){
        let typeId = 1;
        if(y === hBase-1) typeId = 0;
        if(y < hBase-3)   typeId = 2;
        if(noise2d(x*0.7,z*0.7)>0.86 && y<hBase-2) typeId = 7;
        addBlock(x,y,z,typeId);
      }
      if (hBase <= 4 && noise2d(x,z) > 0.35) addBlock(x,hBase,z,3);
    }
  }

  function addTreeAt(x,z){
    let yTop = 0;
    for(let y=12;y>=0;y--){
      if(worldBlocks.has(keyFromXYZ(x,y,z))){ yTop = y+1; break; }
    }
    for(let i=0;i<4;i++) addBlock(x,yTop+i,z,4);
    const cy = yTop+3;
    for(let dx=-2;dx<=2;dx++){
      for(let dz=-2;dz<=2;dz++){
        for(let dy=0;dy<=2;dy++){
          if (Math.abs(dx)+Math.abs(dz)+Math.abs(dy) <= 4) {
            addBlock(x+dx, cy+dy, z+dz, 5);
          }
        }
      }
    }
  }
  for(let i=0;i<12;i++){
    const tx = Math.floor((Math.random()*WORLD_SIZE)-HALF);
    const tz = Math.floor((Math.random()*WORLD_SIZE)-HALF);
    addTreeAt(tx,tz);
  }

  // Lake
  const lakeRadius = 6;
  for(let x=-lakeRadius; x<=lakeRadius; x++){
    for(let z=-lakeRadius; z<=lakeRadius; z++){
      if(x*x + z*z <= lakeRadius*lakeRadius){
        const wx=x, wz=z;
        for(let y=0; y<6; y++) removeBlock(wx,y,wz);
        addBlock(wx,0,wz,6);
        addBlock(wx,1,wz,9);
      }
    }
  }

  // ===== Collisions =====
  const PLAYER_RADIUS = 0.35;
  function isPositionColliding(pos){
    const r = PLAYER_RADIUS;
    const r2 = r*r;
    const minX = Math.floor(pos.x - r);
    const maxX = Math.floor(pos.x + r);
    const minY = Math.floor(pos.y - r);
    const maxY = Math.floor(pos.y + r);
    const minZ = Math.floor(pos.z - r);
    const maxZ = Math.floor(pos.z + r);

    for(let x=minX; x<=maxX; x++){
      for(let y=minY; y<=maxY; y++){
        for(let z=minZ; z<=maxZ; z++){
          const m = worldBlocks.get(keyFromXYZ(x,y,z));
          if(!m) continue;

          const bx = x, by = y, bz = z;
          const closestX = Math.max(bx, Math.min(pos.x, bx+1));
          const closestY = Math.max(by, Math.min(pos.y, by+1));
          const closestZ = Math.max(bz, Math.min(pos.z, bz+1));
          const dx = pos.x - closestX;
          const dy = pos.y - closestY;
          const dz = pos.z - closestZ;
          if (dx*dx + dy*dy + dz*dz < r2) return true;
        }
      }
    }
    return false;
  }

  // ===== Flight movement =====
  const direction = new THREE.Vector3();
  const forwardFlat = new THREE.Vector3();
  const rightFlat = new THREE.Vector3();
  const moveForward = { value:0 }, moveRight = { value:0 }, moveUp = { value:0 };
  const keyState = {};

  let joyForward = 0, joyRight = 0, joyUp = 0;

  function onKey(e,down){ keyState[e.code] = down; }
  window.addEventListener('keydown', e => onKey(e,true));
  window.addEventListener('keyup',   e => onKey(e,false));

  function updateMovement(delta){
    let f = 0, r = 0, u = 0;
    if(keyState['KeyW'] || keyState['ArrowUp'])    f += 1;
    if(keyState['KeyS'] || keyState['ArrowDown'])  f -= 1;
    if(keyState['KeyA'] || keyState['ArrowLeft'])  r -= 1;
    if(keyState['KeyD'] || keyState['ArrowRight']) r += 1;
    if(keyState['Space'])                          u += 1;
    if(keyState['ShiftLeft'] || keyState['ShiftRight']) u -= 1;

    f += joyForward; r += joyRight; u += joyUp;

    f = Math.max(-1, Math.min(1, f));
    r = Math.max(-1, Math.min(1, r));
    u = Math.max(-1, Math.min(1, u));

    moveForward.value = f;
    moveRight.value   = r;
    moveUp.value      = u;

    direction.set(0,0,0);
    forwardFlat.set(0,0,-1).applyEuler(new THREE.Euler(0, yaw, 0, 'YXZ')).normalize();
    rightFlat.crossVectors(forwardFlat, new THREE.Vector3(0,1,0)).normalize();

    if(moveForward.value) direction.addScaledVector(forwardFlat, moveForward.value);
    if(moveRight.value)   direction.addScaledVector(rightFlat, moveRight.value);
    if(moveUp.value)      direction.y += moveUp.value;

    if(direction.lengthSq() > 0) direction.normalize();

    const SPEED = 18;
    const move = direction.multiplyScalar(SPEED * delta);

    const newPos = player.position.clone();

    newPos.x += move.x;
    if(isPositionColliding(newPos)) newPos.x = player.position.x;

    newPos.y += move.y;
    if(isPositionColliding(newPos)) newPos.y = player.position.y;

    newPos.z += move.z;
    if(isPositionColliding(newPos)) newPos.z = player.position.z;

    player.position.copy(newPos);
  }

  // ===== UI: hotbar + inventory =====
  let currentBlockIndex = 0;
  let editMode = 'remove';

  const hotbar = document.getElementById('hotbar');
  const posEl = document.getElementById('pos');
  const blockNameEl = document.getElementById('blockName');
  const modeToggle = document.getElementById('modeToggle');
  const modeText = document.getElementById('modeText');
  const modeIcon = modeToggle.querySelector('.icon');

  const invBtn = document.getElementById('invBtn');
  const invOverlay = document.getElementById('invOverlay');
  const invClose = document.getElementById('invClose');
  const invGrid = document.getElementById('invGrid');
  let inventoryOpen = false;

  function updateModeUI(){
    if(editMode === 'remove'){
      modeText.textContent = 'Режим: ломать';
      modeIcon.textContent = '🧱';
    } else {
      modeText.textContent = 'Режим: ставить';
      modeIcon.textContent = '➕';
    }
  }
  updateModeUI();

  function openInventory(){
    inventoryOpen = true;
    invOverlay.style.display = 'block';
    buildInventoryGrid();
    buildHotbar();
  }
  function closeInventory(){
    inventoryOpen = false;
    invOverlay.style.display = 'none';
  }
  function toggleInventory(){
    inventoryOpen ? closeInventory() : openInventory();
  }

  invBtn.addEventListener('click', (e) => { e.preventDefault(); toggleInventory(); });
  invBtn.addEventListener('touchstart', (e) => { e.preventDefault(); toggleInventory(); }, {passive:false});
  invClose.addEventListener('click', (e) => { e.preventDefault(); closeInventory(); });
  invClose.addEventListener('touchstart', (e) => { e.preventDefault(); closeInventory(); }, {passive:false});
  invOverlay.addEventListener('click', (e) => {
    if(e.target === invOverlay) closeInventory();
  });

  // keyboard toggle: E
  window.addEventListener('keydown', (e) => {
    if(e.code === 'KeyE'){
      toggleInventory();
    }
  });

  modeToggle.addEventListener('click', () => {
    editMode = (editMode === 'remove') ? 'place' : 'remove';
    updateModeUI();
  });
  modeToggle.addEventListener('touchstart', (e) => {
    e.preventDefault();
    editMode = (editMode === 'remove') ? 'place' : 'remove';
    updateModeUI();
  }, {passive:false});

  function buildHotbar(){
    hotbar.innerHTML = '';
    blockTypes.forEach((t,i)=>{
      const slot = document.createElement('div');
      slot.className = 'slot' + (i===currentBlockIndex ? ' active' : '');
      slot.dataset.index = i;

      const col = document.createElement('div');
      col.className = 'color';
      const hex = '#' + t.color.toString(16).padStart(6,'0');
      col.style.background = t.isWater
        ? `linear-gradient(135deg, ${hex}, #8fc4ff)`
        : `linear-gradient(135deg, ${hex}, #ffffff40)`;
      slot.appendChild(col);

      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = i+1;
      slot.appendChild(num);

      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = getCount(t.id);
      slot.appendChild(cnt);

      hotbar.appendChild(slot);
    });
    blockNameEl.textContent = blockTypes[currentBlockIndex].name;
  }

  function buildInventoryGrid(){
    invGrid.innerHTML = '';
    for(let i=0;i<blockTypes.length;i++){
      const t = blockTypes[i];
      const item = document.createElement('div');
      item.className = 'invItem' + (i===currentBlockIndex ? ' active' : '');
      item.dataset.index = i;

      const sw = document.createElement('div');
      sw.className = 'invSwatch';
      const hex = '#' + t.color.toString(16).padStart(6,'0');
      sw.style.background = t.isWater
        ? `linear-gradient(135deg, ${hex}, #8fc4ff)`
        : `linear-gradient(135deg, ${hex}, #ffffff40)`;

      const meta = document.createElement('div');
      meta.className = 'invMeta';
      const name = document.createElement('div');
      name.className = 'invName';
      name.textContent = t.name;
      const count = document.createElement('div');
      count.className = 'invCount';
      count.textContent = `Кол-во: ${getCount(t.id)}`;

      meta.appendChild(name);
      meta.appendChild(count);

      item.appendChild(sw);
      item.appendChild(meta);
      invGrid.appendChild(item);
    }
  }

  function selectBlockIndex(idx){
    if(idx < 0 || idx >= blockTypes.length) return;
    currentBlockIndex = idx;
    buildHotbar();
    if(inventoryOpen) buildInventoryGrid();
  }

  buildHotbar();

  // Hotbar selection
  function selectBlockFromSlot(slot){
    const idx = Number(slot.dataset.index);
    if(!Number.isNaN(idx)) selectBlockIndex(idx);
  }
  hotbar.addEventListener('click', (e) => {
    const slot = e.target.closest('.slot');
    if(!slot) return;
    selectBlockFromSlot(slot);
  });
  hotbar.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const slot = el && el.closest('.slot');
    if(!slot) return;
    selectBlockFromSlot(slot);
  }, {passive:false});

  // Inventory selection
  invGrid.addEventListener('click', (e) => {
    const item = e.target.closest('.invItem');
    if(!item) return;
    selectBlockIndex(Number(item.dataset.index));
  });
  invGrid.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const item = el && el.closest('.invItem');
    if(!item) return;
    selectBlockIndex(Number(item.dataset.index));
  }, {passive:false});

  // Wheel / digits (desktop)
  window.addEventListener('wheel', e => {
    if(inventoryOpen) return;
    const dir = Math.sign(e.deltaY);
    selectBlockIndex((currentBlockIndex + dir + blockTypes.length) % blockTypes.length);
  }, {passive:true});

  window.addEventListener('keydown', e => {
    if(e.code.startsWith('Digit')){
      const n = parseInt(e.code.slice(5),10);
      if(!isNaN(n) && n>=1 && n<=blockTypes.length) selectBlockIndex(n-1);
    }
  });

  // ===== Raycast edit =====
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(0,0);

  function getBlockIntersection(){
    raycaster.setFromCamera(pointer, camera);
    const objects = Array.from(worldBlocks.values());
    const intersects = raycaster.intersectObjects(objects, false);
    return intersects[0] || null;
  }

  function performEdit(action){
    if(inventoryOpen) return;

    const hit = getBlockIntersection();
    if(!hit) return;

    const hitPos = hit.object.position;
    const x = Math.floor(hitPos.x);
    const y = Math.floor(hitPos.y);
    const z = Math.floor(hitPos.z);

    if(action === 'remove'){
      const removedId = removeBlock(x,y,z);
      if(removedId !== null){
        addToInv(removedId, 1);
        buildHotbar();
        if(inventoryOpen) buildInventoryGrid();
      }
    } else if(action === 'place'){
      const blockId = blockTypes[currentBlockIndex].id;
      if(!canSpend(blockId, 1)) return; // нет блоков

      const normal = hit.face.normal.clone();
      const placeX = Math.floor(hitPos.x + normal.x);
      const placeY = Math.floor(hitPos.y + normal.y);
      const placeZ = Math.floor(hitPos.z + normal.z);

      const key = keyFromXYZ(placeX,placeY,placeZ);
      if(worldBlocks.has(key)) return;

      // не ставим блок "внутрь игрока"
      const testPos = player.position.clone();
      if(
        placeX <= testPos.x && testPos.x <= placeX+1 &&
        placeY <= testPos.y && testPos.y <= placeY+1 &&
        placeZ <= testPos.z && testPos.z <= placeZ+1
      ){
        return;
      }

      const ok = addBlock(placeX,placeY,placeZ, blockId);
      if(ok){
        spend(blockId, 1);
        buildHotbar();
        if(inventoryOpen) buildInventoryGrid();
      }
    }
  }

  // Mouse: LMB remove, RMB place
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (isTouchDevice) return;
    if(inventoryOpen) return;

    const isLeft = (e.button === 0);
    const isRight = (e.button === 2);
    if(!isLeft && !isRight) return;
    if(isLeft) performEdit('remove');
    else if(isRight) performEdit('place');
  });
  window.addEventListener('contextmenu', e => e.preventDefault());

  // ===== Touch joystick/buttons =====
  const joystick = document.getElementById('joystickLeft');
  const joystickHandle = document.getElementById('joystickHandle');
  const btnUp = document.getElementById('btnUp');
  const btnDown = document.getElementById('btnDown');

  let moveTouchId = null;
  let joyCenter = { x:0, y:0 };

  function updateJoyFromTouch(t){
    const rect = joystick.getBoundingClientRect();
    joyCenter.x = rect.left + rect.width/2;
    joyCenter.y = rect.top + rect.height/2;
    const dx = t.clientX - joyCenter.x;
    const dy = t.clientY - joyCenter.y;
    const maxR = rect.width/2;
    const dist = Math.min(Math.sqrt(dx*dx+dy*dy), maxR);
    const nx = dist ? dx/dist : 0;
    const ny = dist ? dy/dist : 0;
    const maxOffset = maxR - 25;

    joyRight = nx;
    joyForward = -ny;

    joystickHandle.style.transform = `translate(${nx * maxOffset}px, ${ny * maxOffset}px)`;
  }

  function resetJoystick(){
    joyForward = 0;
    joyRight = 0;
    joystickHandle.style.transform = 'translate(0,0)';
    moveTouchId = null;
  }

  if (isTouchDevice) {
    joystick.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      moveTouchId = t.identifier;
      updateJoyFromTouch(t);
    }, {passive:false});

    joystick.addEventListener('touchmove', e => {
      e.preventDefault();
      for(const t of e.changedTouches){
        if(t.identifier === moveTouchId){ updateJoyFromTouch(t); break; }
      }
    }, {passive:false});

    joystick.addEventListener('touchend', e => {
      for(const t of e.changedTouches){
        if(t.identifier === moveTouchId){ resetJoystick(); break; }
      }
    });
    joystick.addEventListener('touchcancel', e => {
      for(const t of e.changedTouches){
        if(t.identifier === moveTouchId){ resetJoystick(); break; }
      }
    });

    btnUp.addEventListener('touchstart', e => { e.preventDefault(); joyUp = 1; }, {passive:false});
    btnUp.addEventListener('touchend',   () => { joyUp = 0; });
    btnUp.addEventListener('touchcancel',() => { joyUp = 0; });

    btnDown.addEventListener('touchstart', e => { e.preventDefault(); joyUp = -1; }, {passive:false});
    btnDown.addEventListener('touchend',   () => { joyUp = 0; });
    btnDown.addEventListener('touchcancel',() => { joyUp = 0; });
  }

  // ===== Touch look + tap edit =====
  let lookTouchId = null;
  let lookStartX = 0;
  let lookStartY = 0;
  let lookInitX = 0;
  let lookInitY = 0;
  let lookStartTime = 0;

  if (isTouchDevice) {
    renderer.domElement.addEventListener('touchstart', e => {
      if(inventoryOpen) return;

      for(const t of e.changedTouches){
        const target = document.elementFromPoint(t.clientX, t.clientY);
        if (target && (
            target === joystick || joystick.contains(target) ||
            target === btnUp || target === btnDown ||
            target === hotbar || hotbar.contains(target) ||
            target === modeToggle || modeToggle.contains(target) ||
            target === invBtn || invBtn.contains(target)
        )) continue;

        if (lookTouchId === null) {
          lookTouchId = t.identifier;
          lookInitX = t.clientX; lookInitY = t.clientY;
          lookStartX = t.clientX; lookStartY = t.clientY;
          lookStartTime = performance.now();
          break;
        }
      }
    }, {passive:true});

    renderer.domElement.addEventListener('touchmove', e => {
      if(inventoryOpen) return;

      for(const t of e.changedTouches){
        if(t.identifier === lookTouchId){
          const dx = t.clientX - lookStartX;
          const dy = t.clientY - lookStartY;
          const sensitivity = 0.003;
          yaw   -= dx * sensitivity;
          pitch -= dy * sensitivity;
          pitch = Math.max(-PI_2 + 0.1, Math.min(PI_2 - 0.1, pitch));
          yawPitchEuler.set(pitch, yaw, 0, 'YXZ');
          camera.quaternion.setFromEuler(yawPitchEuler);
          lookStartX = t.clientX; lookStartY = t.clientY;
          e.preventDefault();
          break;
        }
      }
    }, {passive:false});

    renderer.domElement.addEventListener('touchend', e => {
      for(const t of e.changedTouches){
        if(t.identifier === lookTouchId){
          const dt = performance.now() - lookStartTime;
          const dxTotal = t.clientX - lookInitX;
          const dyTotal = t.clientY - lookInitY;
          const dist2 = dxTotal*dxTotal + dyTotal*dyTotal;

          const target = document.elementFromPoint(t.clientX, t.clientY);
          const isUI = target && (
            target === joystick || joystick.contains(target) ||
            target === btnUp || target === btnDown ||
            target === hotbar || hotbar.contains(target) ||
            target === modeToggle || modeToggle.contains(target) ||
            target === invBtn || invBtn.contains(target) ||
            target === invOverlay || invOverlay.contains(target)
          );

          if(!inventoryOpen && !isUI && dt < 250 && dist2 < 15*15){
            performEdit(editMode);
          }

          lookTouchId = null;
          break;
        }
      }
    });

    renderer.domElement.addEventListener('touchcancel', e => {
      for(const t of e.changedTouches){
        if(t.identifier === lookTouchId){ lookTouchId = null; break; }
      }
    });
  }

  // ===== Render loop =====
  let prevTime = performance.now();
  function animate(now){
    const delta = Math.min(0.05, (now - prevTime)/1000);
    prevTime = now;

    updateMovement(delta);

    const p = player.position;
    posEl.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  window.addEventListener('resize', ()=>{
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // initial inventory grid ready
  buildInventoryGrid();
})();
