(() => {
  function generateWorld({
    worldBlocks,
    addBlock,
    removeBlock,
    keyFromXYZ,
    worldSize = 128,
    treeCount = 12,
    lakeRadius = 6,
    applePieCount = 35,
    applePieBlockId = 10
  }) {
    const half = worldSize / 2;

    function noise2d(x, z) {
      const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
      return s - Math.floor(s);
    }

    for (let x = -half; x < half; x++) {
      for (let z = -half; z < half; z++) {
        const hBase = 4 + Math.floor(noise2d(x * 0.3, z * 0.3) * 5);
        for (let y = 0; y < hBase; y++) {
          let typeId = 1;
          if (y === hBase - 1) typeId = 0;
          if (y < hBase - 3) typeId = 2;
          if (noise2d(x * 0.7, z * 0.7) > 0.86 && y < hBase - 2) typeId = 7;
          addBlock(x, y, z, typeId);
        }
        if (hBase <= 4 && noise2d(x, z) > 0.35) addBlock(x, hBase, z, 3);
      }
    }

    function addTreeAt(x, z) {
      let yTop = 0;
      for (let y = 12; y >= 0; y--) {
        if (worldBlocks.has(keyFromXYZ(x, y, z))) {
          yTop = y + 1;
          break;
        }
      }
      for (let i = 0; i < 4; i++) addBlock(x, yTop + i, z, 4);
      const cy = yTop + 3;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dy = 0; dy <= 2; dy++) {
            if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) <= 4) {
              addBlock(x + dx, cy + dy, z + dz, 5);
            }
          }
        }
      }
    }

    for (let i = 0; i < treeCount; i++) {
      const tx = Math.floor(Math.random() * worldSize - half);
      const tz = Math.floor(Math.random() * worldSize - half);
      addTreeAt(tx, tz);
    }

    function findSurfaceY(x, z) {
      for (let y = 20; y >= 0; y--) {
        const key = keyFromXYZ(x, y, z);
        const block = worldBlocks.get(key);
        if (block) {
          return { y: y + 1, blockId: block.userData.blockId };
        }
      }
      return { y: 1, blockId: null };
    }

    function addApplePieAt(x, z) {
      const { y, blockId } = findSurfaceY(x, z);
      if (blockId === 9) return false;
      const key = keyFromXYZ(x, y, z);
      if (worldBlocks.has(key)) return false;
      return addBlock(x, y, z, applePieBlockId);
    }

    let placedPies = 0;
    let attempts = 0;
    while (placedPies < applePieCount && attempts < applePieCount * 6) {
      const px = Math.floor(Math.random() * worldSize - half);
      const pz = Math.floor(Math.random() * worldSize - half);
      if (addApplePieAt(px, pz)) placedPies++;
      attempts++;
    }

    for (let x = -lakeRadius; x <= lakeRadius; x++) {
      for (let z = -lakeRadius; z <= lakeRadius; z++) {
        if (x * x + z * z <= lakeRadius * lakeRadius) {
          const wx = x;
          const wz = z;
          for (let y = 0; y < 6; y++) removeBlock(wx, y, wz);
          addBlock(wx, 0, wz, 6);
          addBlock(wx, 1, wz, 9);
        }
      }
    }
  }

  window.generateWorld = generateWorld;
})();
