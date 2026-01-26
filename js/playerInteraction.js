(() => {
  function createPlayerInteractionManager(options) {
    const {
      player,
      camera,
      worldBlocks,
      blockTypes,
      addBlock,
      removeBlock,
      keyFromXYZ,
      getVisibleMeshes,
      playerRadius = 0.35,
      mode = 'creative'
    } = options;

    const inventory = new Map();

    function getCount(id){ return inventory.get(id) ?? 0; }
    function setCount(id, v){ inventory.set(id, Math.max(0, Math.floor(v))); }
    function addToInv(id, delta){ setCount(id, getCount(id) + delta); }
    function canSpend(id, delta){ return getCount(id) >= delta; }
    function spend(id, delta){
      if(!canSpend(id, delta)) return false;
      setCount(id, getCount(id) - delta);
      return true;
    }

    for (const t of blockTypes) {
      setCount(t.id, t.isWater ? 64 : 256);
    }

    function isPositionColliding(pos){
      const r = playerRadius;
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

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(0,0);

    function getBlockIntersection(){
      raycaster.setFromCamera(pointer, camera);
      const objects = getVisibleMeshes();
      const intersects = raycaster.intersectObjects(objects, false);
      return intersects[0] || null;
    }

    function createCreativeMode(){
      return {
        name: 'creative',
        performEdit(action, blockId){
          const hit = getBlockIntersection();
          if(!hit) return { changed: false };

          const hitPos = hit.object.position;
          const x = Math.floor(hitPos.x);
          const y = Math.floor(hitPos.y);
          const z = Math.floor(hitPos.z);

          if(action === 'remove'){
            const removedId = removeBlock(x,y,z);
            if(removedId !== null){
              addToInv(removedId, 1);
              return { changed: true, inventoryChanged: true, removedId };
            }
            return { changed: false };
          }

          if(action === 'place'){
            if(!canSpend(blockId, 1)) return { changed: false };

            const normal = hit.face.normal.clone();
            const placeX = Math.floor(hitPos.x + normal.x);
            const placeY = Math.floor(hitPos.y + normal.y);
            const placeZ = Math.floor(hitPos.z + normal.z);

            const key = keyFromXYZ(placeX,placeY,placeZ);
            if(worldBlocks.has(key)) return { changed: false };

            const testPos = player.position.clone();
            if(
              placeX <= testPos.x && testPos.x <= placeX+1 &&
              placeY <= testPos.y && testPos.y <= placeY+1 &&
              placeZ <= testPos.z && testPos.z <= placeZ+1
            ){
              return { changed: false };
            }

            const ok = addBlock(placeX,placeY,placeZ, blockId);
            if(ok){
              spend(blockId, 1);
              return { changed: true, inventoryChanged: true };
            }
          }

          return { changed: false };
        }
      };
    }

    const modes = new Map();
    let activeMode = null;

    function registerMode(name, modeDefinition){
      modes.set(name, modeDefinition);
    }

    function setMode(name){
      const nextMode = modes.get(name);
      if(!nextMode){
        throw new Error(`Unknown interaction mode: ${name}`);
      }
      activeMode = nextMode;
    }

    registerMode('creative', createCreativeMode());
    setMode(mode);

    function performEdit(action, blockId){
      return activeMode.performEdit(action, blockId);
    }

    return {
      getCount,
      setCount,
      addToInv,
      canSpend,
      spend,
      isPositionColliding,
      performEdit,
      registerMode,
      setMode
    };
  }

  window.createPlayerInteractionManager = createPlayerInteractionManager;
})();
