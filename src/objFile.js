import glMatrix from './glMatrix.js'

function createGPUBuffer(device, buffer, usage) {
  const bufferDesc = {
      size: buffer.byteLength,
      usage: usage,
      mappedAtCreation: true
  };

  let gpuBuffer = device.createBuffer(bufferDesc);

  if (buffer instanceof Float32Array) {
      const writeArrayNormal = new Float32Array(gpuBuffer.getMappedRange());
      writeArrayNormal.set(buffer);
  }
  else if (buffer instanceof Uint16Array) {
      const writeArrayNormal = new Uint16Array(gpuBuffer.getMappedRange());
      writeArrayNormal.set(buffer);
  }
  else if (buffer instanceof Uint8Array) {
      const writeArrayNormal = new Uint8Array(gpuBuffer.getMappedRange());
      writeArrayNormal.set(buffer);
  }
  else if (buffer instanceof Uint32Array) {
      const writeArrayNormal = new Uint32Array(gpuBuffer.getMappedRange());
      writeArrayNormal.set(buffer);
  }
  else {
      const writeArrayNormal = new Float32Array(gpuBuffer.getMappedRange());
      writeArrayNormal.set(buffer);
      console.error("Unhandled buffer format ", typeof gpuBuffer);
  }
  gpuBuffer.unmap();
  return gpuBuffer;
}

export async function loadObj(device, url) {
  const objResponse = await fetch(url);
  const objBody = await objResponse.text();

  let obj = await (async () => {
      return new Promise((resolve, reject) => {
          let obj = new OBJFile(objBody);
          obj.parse();
          resolve(obj);
      })
  })();

  let positions = [];
  let normals = [];
  let texCoords = [];

  let minX = Number.MAX_VALUE;
  let maxX = Number.MIN_VALUE;

  let minY = Number.MAX_VALUE;
  let maxY = Number.MIN_VALUE;

  let minZ = Number.MAX_VALUE;
  let maxZ = Number.MIN_VALUE;

  for (let i = 0; i < obj.result.models[0].faces.length * 3; i++) {
      positions.push(0.0);
      positions.push(0.0);
      positions.push(0.0);
      normals.push(0.0);
      normals.push(0.0);
      normals.push(0.0);
      texCoords.push(0.0)
      texCoords.push(0.0)
  }
  
  positions = new Float32Array(positions);
  normals = new Float32Array(normals);
  texCoords = new Float32Array(texCoords)

  let indices = Array(obj.result.models[0].faces.length * 3).fill(0).map((_, i) => i);
  
//cs_start: normal_loading
  let indexNumber = 0
  for (let f of obj.result.models[0].faces) {
      for (let facetPoint of f.vertices) {

          const { x, y, z } = obj.result.models[0].vertices[facetPoint.vertexIndex - 1]

          minX = Math.min(x, minX);
          maxX = Math.max(x, maxX);

          minY = Math.min(y, minY);
          maxY = Math.max(y, maxY);

          minZ = Math.min(z, minZ);
          maxZ = Math.max(z, maxZ);

          positions[indexNumber * 3 + 0] = x
          positions[indexNumber * 3 + 1] = y
          positions[indexNumber * 3 + 2] = z

          let texico = obj.result.models[0].textureCoords[facetPoint.textureCoordsIndex - 1]

          texCoords[indexNumber * 2 + 0] = (texico.u)
        
          // Flipped because blender counts the v coordinate from the bottom rather than the top
          texCoords[indexNumber * 2 + 1] = (1 - texico.v)
        
          let { x: i, y: j, z: k } = obj.result.models[0].vertexNormals[facetPoint.vertexNormalIndex - 1]
          normals[indexNumber * 3 + 0] = i
          normals[indexNumber * 3 + 1] = j
          normals[indexNumber * 3 + 2] = k

          indexNumber++
      }

  }
  
  let normalBuffer = createGPUBuffer(device, normals, GPUBufferUsage.VERTEX);
//cs_end: normal_loading

  const indexSize = indices.length;

  indices = new Uint16Array(indices);

  let positionBuffer = createGPUBuffer(device, positions, GPUBufferUsage.VERTEX);
  let indexBuffer = createGPUBuffer(device, indices, GPUBufferUsage.INDEX);
  let texCoordBuffer = createGPUBuffer(device, texCoords, GPUBufferUsage.VERTEX)
  
  return {
      positionBuffer, normalBuffer, texCoordBuffer, indexBuffer, indexSize, center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5],
      radius: Math.max(Math.max(maxX - minX, maxY - minY), maxZ - minZ) * 0.5
  }
}


export class OBJFile {
    constructor(fileContents, defaultModelName) {
      this._reset();
      this.fileContents = fileContents;
      this.defaultModelName = (defaultModelName || 'untitled');
    }
  
    _reset() {
      this.result = {
        models: [],
        materialLibraries: []
      };
      this.currentMaterial = '';
      this.currentGroup = '';
      this.smoothingGroup = 0;
    }
  
    parse() {
      this._reset();
  
      const _stripComments = (lineString) => {
        const commentIndex = lineString.indexOf('#');
        if (commentIndex > -1) { return lineString.substring(0, commentIndex); }
        return lineString;
      };
  
      const lines = this.fileContents.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const line = _stripComments(lines[i]);
  
        const lineItems = line.replace(/\s\s+/g, ' ').trim().split(' ');
  
        switch (lineItems[0].toLowerCase()) {
          case 'o': // Start A New Model
            this._parseObject(lineItems);
            break;
          case 'g': // Start a new polygon group
            this._parseGroup(lineItems);
            break;
          case 'v': // Define a vertex for the current model
            this._parseVertexCoords(lineItems);
            break;
          case 'vt': // Texture Coords
            this._parseTextureCoords(lineItems);
            break;
          case 'vn': // Define a vertex normal for the current model
            this._parseVertexNormal(lineItems);
            break;
          case 's': // Smooth shading statement
            this._parseSmoothShadingStatement(lineItems);
            break;
          case 'f': // Define a Face/Polygon
            this._parsePolygon(lineItems);
            break;
          case 'mtllib': // Reference to a material library file (.mtl)
            this._parseMtlLib(lineItems);
            break;
          case 'usemtl': // Sets the current material to be applied to polygons defined from this point forward
            this._parseUseMtl(lineItems);
            break;
        }
      }
  
      return this.result;
    }
  
    _currentModel() {
      if (this.result.models.length == 0) {
        this.result.models.push({
          name: this.defaultModelName,
          vertices: [],
          textureCoords: [],
          vertexNormals: [],
          faces: []
        });
        this.currentGroup = '';
        this.smoothingGroup = 0;
      }
  
      return this.result.models[this.result.models.length - 1];
    }
  
    _parseObject(lineItems) {
      const modelName = lineItems.length >= 2 ? lineItems[1] : this.defaultModelName;
      this.result.models.push({
        name: modelName,
        vertices: [],
        textureCoords: [],
        vertexNormals: [],
        faces: []
      });
      this.currentGroup = '';
      this.smoothingGroup = 0;
    }
  
    _parseGroup(lineItems) {
      if (lineItems.length != 2) { throw 'Group statements must have exactly 1 argument (eg. g group_1)'; }
  
      this.currentGroup = lineItems[1];
    }
  
    _parseVertexCoords(lineItems) {
      const x = lineItems.length >= 2 ? parseFloat(lineItems[1]) : 0.0;
      const y = lineItems.length >= 3 ? parseFloat(lineItems[2]) : 0.0;
      const z = lineItems.length >= 4 ? parseFloat(lineItems[3]) : 0.0;
  
      this._currentModel().vertices.push({ x, y, z });
    }
  
    _parseTextureCoords(lineItems) {
      const u = lineItems.length >= 2 ? parseFloat(lineItems[1]) : 0.0;
      const v = lineItems.length >= 3 ? parseFloat(lineItems[2]) : 0.0;
      const w = lineItems.length >= 4 ? parseFloat(lineItems[3]) : 0.0;
  
      this._currentModel().textureCoords.push({ u, v, w });
    }
  
    _parseVertexNormal(lineItems) {
      const x = lineItems.length >= 2 ? parseFloat(lineItems[1]) : 0.0;
      const y = lineItems.length >= 3 ? parseFloat(lineItems[2]) : 0.0;
      const z = lineItems.length >= 4 ? parseFloat(lineItems[3]) : 0.0;
  
      this._currentModel().vertexNormals.push({ x, y, z });
    }
  
    _parsePolygon(lineItems) {
      const totalVertices = (lineItems.length - 1);
      if (totalVertices < 3) { throw (`Face statement has less than 3 vertices${this.filePath}${this.lineNumber}`); }
  
      const face = {
        material: this.currentMaterial,
        group: this.currentGroup,
        smoothingGroup: this.smoothingGroup,
        vertices: []
      };
  
      for (let i = 0; i < totalVertices; i += 1) {
        const vertexString = lineItems[i + 1];
        const vertexValues = vertexString.split('/');
  
        if (vertexValues.length < 1 || vertexValues.length > 3) { throw (`Too many values (separated by /) for a single vertex${this.filePath}${this.lineNumber}`); }
  
        let vertexIndex = 0;
        let textureCoordsIndex = 0;
        let vertexNormalIndex = 0;
        vertexIndex = parseInt(vertexValues[0]);
        if (vertexValues.length > 1 && (vertexValues[1] != '')) { textureCoordsIndex = parseInt(vertexValues[1]); }
        if (vertexValues.length > 2) { vertexNormalIndex = parseInt(vertexValues[2]); }
  
        if (vertexIndex == 0) { throw 'Faces uses invalid vertex index of 0'; }
  
        // Negative vertex indices refer to the nth last defined vertex
        // convert these to postive indices for simplicity
        if (vertexIndex < 0) { vertexIndex = this._currentModel().vertices.length + 1 + vertexIndex; }
  
        face.vertices.push({
          vertexIndex,
          textureCoordsIndex,
          vertexNormalIndex
        });
      }
      this._currentModel().faces.push(face);
    }
  
    _parseMtlLib(lineItems) {
      if (lineItems.length >= 2) { this.result.materialLibraries.push(lineItems[1]); }
    }
  
    _parseUseMtl(lineItems) {
      if (lineItems.length >= 2) { this.currentMaterial = lineItems[1]; }
    }
  
    _parseSmoothShadingStatement(lineItems) {
      if (lineItems.length != 2) { throw 'Smoothing group statements must have exactly 1 argument (eg. s <number|off>)'; }
  
      const groupNumber = (lineItems[1].toLowerCase() == 'off') ? 0 : parseInt(lineItems[1]);
      this.smoothingGroup = groupNumber;
    }
  }