
importScripts('frep-csg.js', 'js/underscore-min.js');

onmessage = function(e){

	var f = eval("("+e.data.funcDef+")");
	var localCsg = new CSG(e.data.params, e.data.attrs, f);

	var polygonizer = new CSG.Polygonizer(this, 
			e.data.boundingBox.min, 
			e.data.boundingBox.max,
			e.data.grid,
			e.data.isosurface,
			localCsg);

	var vertices = new Array();
	var normals = new Array();
	var indices = new Array();
	var colors = new Array();

	polygonizer.polygonize(vertices, normals, indices, colors);

	postMessage({'worker':e.data.worker,'results':{'vertices':vertices, 'normals':normals, 'indices':indices, 'colors':colors}})
	close();

}


/** Taken from Hyperfun Applet Polygonizer by Yuichiro Goto **/
CSG.Polygonizer = function(worker, min, max, div, isovalue, csg) {
	this.worker = worker;
	// Lower left front corner of the bounding box
	this.xMin = min.x;
	this.yMin = min.y;
	this.zMin = min.z;

	// Upper right back corner of the bounding box
	this.xMax = max.x;
	this.yMax = max.y;
	this.zMax = max.z;

	// Number of divisions along each axis of the bounding box
	this.xDiv = div.x;
	this.yDiv = div.y;
	this.zDiv = div.z;
	
	this.csg = csg;

	// Isovalue of the isosurface
	this.isovalue = isovalue;

	var dx, dy, dz;
	var ndx, ndy, ndz;
}


CSG.Polygonizer.prototype = {
	lerp: function(t, v0, v1) {
		return [ 	v0[0] + t * (v1[0] - v0[0]),
					v0[1] + t * (v1[1] - v0[1]), 
					v0[2] + t * (v1[2] - v0[2]) 
				];
	},
	calcNormal: function(v) {
		var x = v[0];
		var y = v[1];
		var z = v[2];

		var f = this.csg.call([x, y, z])[0];
		var nx = -(this.csg.call([x + this.ndx, y, z])[0] - f) / this.ndx;
		var ny = -(this.csg.call([x, y + this.ndy, z])[0] - f) / this.ndy;
		var nz = -(this.csg.call([x, y, z + this.ndz])[0] - f) / this.ndz;

		var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
		if (len > 0.0) {
			nx /= len;
			ny /= len;
			nz /= len;
		}
		return [ nx, ny, nz ];
	},
	sample: function(plane, z, attrs) {
		
		for (var j = 0; j <= this.yDiv; j++) {
			var y = this.yMin + j * this.dy;
			for (var i = 0; i <= this.xDiv; i++) {
				var x = this.xMin + i * this.dx;
				var result = this.csg.call([x,y,z])
				plane[j][i] = result[0];
				attrs[j][i] = result[1];
			}
		}
	},
	polygonize: function(vertices, normals, indices, colors) {

		var eps = (this.isovalue == 0.0) ? 1.0E-5 : this.isovalue * 1.0E-5;

		var values = new Array(8);
		for (var i = 0; i < values.length; i++) {
			values[i] = 0.0;
		}
		
		var positionsD = new Array(8)
		var positionsI = new Array(8)
		for (var i = 0; i < positionsD.length; i++) {
			positionsD[i] = new Array(3);
			positionsI[i] = new Array(3);
		}

		var upperPlane = new Array(this.yDiv + 1);
		var lowerPlane = new Array(this.yDiv + 1);
		for (var i = 0; i < upperPlane.length; i++) {
			upperPlane[i] = new Array(this.xDiv + 1);
			lowerPlane[i] = new Array(this.xDiv + 1);
		}

		var attrs = new Array(this.yDiv + 1);
		for (var i = 0; i < upperPlane.length; i++) {
			attrs[i] = new Array(this.xDiv + 1);
		}

		var connectionSwitches = new Array(6);
		for (var i = 0; i < connectionSwitches.length; i++) {
			connectionSwitches[i] = 0;
		}
		var edgeToIndex = new Array(12);
		for (var i = 0; i < edgeToIndex.length; i++) {
			edgeToIndex[i] = 0;
		}
		this.indexTable = {};

		this.dx = (this.xMax - this.xMin) / this.xDiv;
		this.dy = (this.yMax - this.yMin) / this.yDiv;
		this.dz = (this.zMax - this.zMin) / this.zDiv;

		this.ndx = 0.001 * this.dx;
		this.ndy = 0.001 * this.dy;
		this.ndz = 0.001 * this.dz;

		this.sample(lowerPlane, this.zMin, attrs);

		for (var k = 0; k < this.zDiv; k++) {
			var zLower = this.zMin + k * this.dz;
			var zUpper = this.zMin + (k+1) * this.dz;
			
			this.sample(upperPlane, zUpper, attrs);

			this.worker.postMessage({'progress':k})

			for (var j = 0; j < this.yDiv; j++) {
				var yLower = this.yMin + j * this.dy;
				var yUpper = this.yMin + (j+1) * this.dy;

				for (var i = 0; i < this.xDiv; i++) {
					var xLower = this.xMin + i * this.dx;
					var xUpper = this.xMin + (i+1) * this.dx;

					// Set sampled function values on each corner of the cube
					values[0] = lowerPlane[j][i];
					values[1] = lowerPlane[j + 1][i];
					values[2] = lowerPlane[j + 1][i + 1];
					values[3] = lowerPlane[j][i + 1];
					values[4] = upperPlane[j][i];
					values[5] = upperPlane[j + 1][i];
					values[6] = upperPlane[j + 1][i + 1];
					values[7] = upperPlane[j][i + 1];

					// Adjust the function values which are almost same as the isovalue
					for (var v in values){
						if (Math.abs(values[v] - this.isovalue) < eps) {
							values[v] += 10.0 * eps;
						}
					}

					// Calculate index into the lookup table
					var cubeIndex = 0;
					if (values[0] > this.isovalue) cubeIndex += 1;
					if (values[1] > this.isovalue) cubeIndex += 2;
					if (values[2] > this.isovalue) cubeIndex += 4;
					if (values[3] > this.isovalue) cubeIndex += 8;
					if (values[4] > this.isovalue) cubeIndex += 16;
					if (values[5] > this.isovalue) cubeIndex += 32;
					if (values[6] > this.isovalue) cubeIndex += 64;
					if (values[7] > this.isovalue) cubeIndex += 128;

					// Skip the empty cube
					if (cubeIndex == 0 || cubeIndex == 255) {
						//console.log("Skip the empty cube");
						continue;
					}
					
					var cube = CSG.LookupTable.getCube(cubeIndex);
					// Set up corner positions of the cube
					positionsD[0][0] = xLower;
					positionsD[0][1] = yLower;
					positionsD[0][2] = zLower;
					positionsD[1][0] = xLower;
					positionsD[1][1] = yUpper;
					positionsD[1][2] = zLower;
					positionsD[2][0] = xUpper;
					positionsD[2][1] = yUpper;
					positionsD[2][2] = zLower;
					positionsD[3][0] = xUpper;
					positionsD[3][1] = yLower;
					positionsD[3][2] = zLower;
					positionsD[4][0] = xLower;
					positionsD[4][1] = yLower;
					positionsD[4][2] = zUpper;
					positionsD[5][0] = xLower;
					positionsD[5][1] = yUpper;
					positionsD[5][2] = zUpper;
					positionsD[6][0] = xUpper;
					positionsD[6][1] = yUpper;
					positionsD[6][2] = zUpper;
					positionsD[7][0] = xUpper;
					positionsD[7][1] = yLower;
					positionsD[7][2] = zUpper;

					positionsI[0][0] = i;
					positionsI[0][1] = j;
					positionsI[0][2] = k;
					positionsI[1][0] = i;
					positionsI[1][1] = j + 1;
					positionsI[1][2] = k;
					positionsI[2][0] = i + 1;
					positionsI[2][1] = j + 1;
					positionsI[2][2] = k;
					positionsI[3][0] = i + 1;
					positionsI[3][1] = j;
					positionsI[3][2] = k;
					positionsI[4][0] = i;
					positionsI[4][1] = j;
					positionsI[4][2] = k + 1;
					positionsI[5][0] = i;
					positionsI[5][1] = j + 1;
					positionsI[5][2] = k + 1;
					positionsI[6][0] = i + 1;
					positionsI[6][1] = j + 1;
					positionsI[6][2] = k + 1;
					positionsI[7][0] = i + 1;
					positionsI[7][1] = j;
					positionsI[7][2] = k + 1;


					

					// Find the cube edges which have intersection points with the isosurface
					for (var edgeIndex = 0; edgeIndex < 12; edgeIndex++) {
						var edge = cube.getEdge(edgeIndex);

						if (edge.getConnectedEdge(0) !== undefined) {
							var key = new CSG.EdgeKey(positionsI[edge.getStartVertexIndex()],positionsI[edge.getEndVertexIndex()]);
							if (this.indexTable.hasOwnProperty(key)) {
								edgeToIndex[edgeIndex] = this.indexTable[key];
							} else {
								var t = (this.isovalue - values[edge.getStartVertexIndex()]) / (values[edge.getEndVertexIndex()] - values[edge.getStartVertexIndex()]);
								var v = this.lerp(t, positionsD[edge.getStartVertexIndex()], positionsD[edge.getEndVertexIndex()]);
								
								vertices.push(v);
								colors.push(attrs[j][i].color || [1,1,1]);
								
								if (normals !== undefined) {
									normals.push(this.calcNormal(v));
								}
								this.indexTable[key] = (edgeToIndex[edgeIndex] = vertices.length - 1);
							}
						}
					}

					// Resolve topological ambiguity on cube faces
					for (var faceIndex = 0; faceIndex < 6; faceIndex++) {
						var face = cube.getFace(faceIndex);
						if (face.isAmbiguous()) {
							var d0 = values[face.getEdge(0).getEndVertexIndex()] - values[face.getEdge(0).getStartVertexIndex()];
							var d1 = values[face.getEdge(2).getEndVertexIndex()] - values[face.getEdge(2).getStartVertexIndex()];
							var t = (this.isovalue - values[face.getEdge(1).getStartVertexIndex()]) / (values[face.getEdge(1).getEndVertexIndex()] - values[face.getEdge(1).getStartVertexIndex()]);
							connectionSwitches[faceIndex] = (t > -d0 / (d1 - d0)) ? 1 : 0;
						} else {
							connectionSwitches[faceIndex] = 0;
						}
					}

					// Get the connectivity graph of the cube edges and trace it to generate triangles
					var connectivity = cube.getEdgeConnectivity(connectionSwitches);

					for (var edgeIndex = 0; edgeIndex < 12;) {
						if (connectivity[edgeIndex] != -1) {
							var index0 = edgeIndex;
							var index1 = connectivity[index0];
							var index2 = connectivity[index1];

							indices.push(edgeToIndex[index0]);
							indices.push(edgeToIndex[index1]);
							indices.push(edgeToIndex[index2]);

							connectivity[index0] = -1;
							connectivity[index1] = -1;
							if (connectivity[index2] != index0) {
								connectivity[index0] = index2;
								continue;
							}
							connectivity[index2] = -1;
						}
						edgeIndex++;
					}

				};
			};
			var tmp = lowerPlane;
			lowerPlane = upperPlane;
			upperPlane = tmp;
		};
	}
};

CSG.Edge = function(index){
	var EDGE_VERTICES = [[0, 1], [1, 2], [3, 2], [0, 3],
						 [4, 5], [5, 6], [7, 6], [4, 7],
						 [0, 4], [1, 5], [2, 6], [3, 7]];
	var index = index;
    var startVertexIndex = EDGE_VERTICES[index][0];
    var endVertexIndex = EDGE_VERTICES[index][1];
    var connectedEdge0 = undefined;
    var connectedEdge1 = undefined;

    return {
		getIndex: function(){
			return index;		
		},
		getStartVertexIndex: function() {
			return startVertexIndex;
		},
		getEndVertexIndex: function() {
			return endVertexIndex;
		},
		setConnectedEdge: function(index, edge){
			if (index != 0 && index != 1) {
			    console.error("Edge.setConnectedEdge: IndexOutOfBoundsException!");
			}
			if (index == 0) {
			    connectedEdge0 = edge;
			} else {
			    connectedEdge1 = edge;
			}
		},
		getConnectedEdge: function(index) {
			if (index != 0 && index != 1) {
			    console.error("Edge.getConnectedEdge: IndexOutOfBoundsException!");
			}
			return (index == 0) ? connectedEdge0 : connectedEdge1;
		},
		toString: function(){
			return "Edge" + index + "[" + startVertexIndex + "," + endVertexIndex + "]";
		}
    }
};


CSG.EdgeKey = function(p0, p1){
	var BIT_SHIFT = 10;
	var BIT_MASK = (1 << BIT_SHIFT) - 1;

	var i0 = p0[0]; 
	var j0 = p0[1];
	var k0 = p0[2];
	var i1 = p1[0]; 
	var j1 = p1[1];
	var k1 = p1[2];

	if (i0 < i1 || (i0 == i1 && (j0 < j1 || (j0 == j1 && k0 < k1)))) {
		// do nothing....
	} else {
		i0 = i1;
		j0 = j1;
		k0 = k1;
		i1 = i0;
		j1 = j0;
		k1 = k0;
	}

	return {
		equals: function(obj) {
			if (this == obj) {
				return true;
			}
			if (obj instanceof EdgeKey) {
				var key = obj;
				if (i0 == key.i0 && j0 == key.j0 && k0 == key.k0
						&& i1 == key.i1 && j1 == key.j1 && k1 == key.k1) {
					return true;
				}
			}
			return false;
		},
		hashCode: function() {
			return (((((i0 & BIT_MASK) << BIT_SHIFT) | (j0 & BIT_MASK)) << BIT_SHIFT) | (k0 & BIT_MASK))
					+ (((((i1 & BIT_MASK) << BIT_SHIFT) | (j1 & BIT_MASK)) << BIT_SHIFT) | (k1 & BIT_MASK));
		},
		toString: function(){
			return "EdgeKey ["+i0+","+j0+","+k0+", "+i1+","+j1+","+k1+"]"
		}
	}
};

CSG.Face = function(index, edges, ambiguous){

	var index = index;
    var edges = edges;
    var ambiguous = ambiguous;

	return {
		getIndex: function() {
			return index;
		},
		getEdge: function(index) {
			return edges[index];
		},
		getEdgeCount: function() {
			return edges.length;
		},
		isAmbiguous: function() {
			return ambiguous;
		},
		contains: function(edge) {
			return (edge == edges[0] || edge == edges[1] ||
			edge == edges[2] || edge == edges[3]) ? true : false;
		},
		toString: function() {
			return "Face" + index + "[" + edges[0] + "," + edges[1] + "," +
		      edges[2] + "," + edges[3] + "]" + (ambiguous ? "*" : "");
		}
	}
};

CSG.FaceFactory = function(){
	var FACE_VERTICES = [
			[0, 1, 2, 3],
			[0, 1, 5, 4],
			[0, 3, 7, 4],
			[4, 5, 6, 7],
			[3, 2, 6, 7],
			[1, 2, 6, 5]
		];

	var FACE_EDGES = [  
			[0,  1,  2,  3],
			[0,  9,  4,  8],
			[3, 11,  7,  8],
			[4,  5,  6,  7],
			[2, 10,  6, 11],
			[1, 10,  5,  9]
		];

	var EDGE_CONNECTIVITY_ON_FACE = [
			[[-1,-1,-1,-1], undefined],
			[[-1,-1,-1, 0], undefined],
			[[ 1,-1,-1,-1], undefined],
			[[-1,-1,-1, 1], undefined],
			[[-1, 2,-1,-1], undefined],
			[[-1, 0,-1, 2], [-1, 2,-1, 0]],
			[[ 2,-1,-1,-1], undefined],
			[[-1,-1,-1, 2], undefined],
			[[-1,-1, 3,-1], undefined],
			[[-1,-1, 0,-1], undefined],
			[[ 1,-1, 3,-1], [ 3,-1, 1,-1]],
			[[-1,-1, 1,-1], undefined],
			[[-1, 3,-1,-1], undefined],
			[[-1, 0,-1,-1], undefined],
			[[ 3,-1,-1,-1], undefined],
			[[-1,-1,-1,-1], undefined] 
		];

    var CW  = 1;
    var CCW = 0;
	var FACE_ORIENTATION = [CW, CCW, CW, CCW, CW, CCW];

	function isAmbiguousBitPattern(bitPatternOnFace) {
		return (bitPatternOnFace == 5 || bitPatternOnFace == 10) ? true : false;
	};

	function isBitOn(bitPatternOnCube, vertexIndex) {
		return ((bitPatternOnCube & (1 << vertexIndex)) != 0) ? true : false;
    };

    function buildBitPatternOnFace(bitPatternOnCube, faceIndex) {
		var bitPatternOnFace = 0;
		for (var vertexIndex = 0; vertexIndex < 4; vertexIndex++) {
		    if (isBitOn(bitPatternOnCube, FACE_VERTICES[faceIndex][vertexIndex])) {
				bitPatternOnFace |= 1 << vertexIndex;
		    }
		}
		return bitPatternOnFace;
    };

	return {
		createFace: function(faceIndex, bitPatternOnCube, edges) {
			if (faceIndex < 0 || faceIndex > 5) {
				console.error("IllegalArgumentException - faceIndex must be in the range between 0 and 5");
				return;
			}
			if (bitPatternOnCube < 0 || bitPatternOnCube > 255) {
				console.error("IllegalArgumentException - bitPatternOnCube must be in the range between 0 and 255");
				return;
			}
			if (edges.length != 12) {
				console.error("IllegalArgumentException - length of edges must be 12");
				return;
			}
			var bitPatternOnFace = buildBitPatternOnFace(bitPatternOnCube, faceIndex);


			

			var face = new CSG.Face(faceIndex, [edges[FACE_EDGES[faceIndex][0]],
												 edges[FACE_EDGES[faceIndex][1]],
												 edges[FACE_EDGES[faceIndex][2]],
												 edges[FACE_EDGES[faceIndex][3]]], 
												 isAmbiguousBitPattern(bitPatternOnFace));

			var connectivity = EDGE_CONNECTIVITY_ON_FACE[bitPatternOnFace];
			for (var i = 0; i < 2; i++) {
				if (connectivity[i] !== undefined) {
					for (var vertexIndex = 0; vertexIndex < 4; vertexIndex++) {
						if (connectivity[i][vertexIndex] != -1) {
							if (FACE_ORIENTATION[faceIndex] == CW) {
								var edge = face.getEdge(vertexIndex);
								edge.setConnectedEdge(i, face.getEdge(connectivity[i][vertexIndex]));
							} else {
								var edge = face.getEdge(connectivity[i][vertexIndex]);
								edge.setConnectedEdge(i, face.getEdge(vertexIndex));
							}
						}
					}
				}
			}
			return face;
		}
	}
}();

CSG.Cube = function(index){

	var index = index;
	var edges = new Array(12);
	for (var i = 0; i < 12; i++) {
		edges[i] = new CSG.Edge(i);
	};
	var faces = new Array(6);
	for (var i = 0; i < 6; i++) {
		faces[i] = CSG.FaceFactory.createFace(i, index, edges);
	};

	return {
		getIndex: function() {
			return index;
		},
		getEdge: function(index) {
			return edges[index];
		},
		getEdgeCount: function() {
			return edges.length;
		},
		getFace: function(index) {
			return faces[index];
    	},
		getFaceCount: function() {
			return faces.length;
    	},
    	indexToString: function(index) {
			return  (((index & (1<<7)) != 0) ? "1" : "0") +
					(((index & (1<<6)) != 0) ? "1" : "0") +
					(((index & (1<<5)) != 0) ? "1" : "0") +
					(((index & (1<<4)) != 0) ? "1" : "0") +
					(((index & (1<<3)) != 0) ? "1" : "0") +
					(((index & (1<<2)) != 0) ? "1" : "0") +
					(((index & (1<<1)) != 0) ? "1" : "0") +
					(((index & (1<<0)) != 0) ? "1" : "0");
		},
		getEdgeConnectivity: function(connectionSwitches) {
			var connectivity = [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
			for (var faceIndex = 0; faceIndex < 6; faceIndex++) {
				var face = faces[faceIndex];
				if (face.isAmbiguous() == false && connectionSwitches[faceIndex] != 0) {
					console.error("Face.getEdgeConnectivity FaceNotAmbiguousException");
				}
				for (var edgeIndex = 0; edgeIndex < 4; edgeIndex++) {
					var edge = face.getEdge(edgeIndex);
					if (edge.getConnectedEdge(0) !== undefined && face.contains(edge.getConnectedEdge(0))) {
						connectivity[edge.getIndex()] = edge.getConnectedEdge(connectionSwitches[faceIndex]).getIndex();
					}
				}
			}
			return connectivity;
	    },
		toString: function(){
			return "Cube" + index + "[" + faces[0] + "," + faces[1] + "," + faces[2] + "," +
				      faces[3] + "," + faces[4] + "," + faces[5] + "]";
		}
	}
};

CSG.LookupTable = function(){
	var cubes = new Array(256);
	for (var i = 0; i < 256; i++) {
		cubes[i] = new CSG.Cube(i);
	};

	return {
		getCube: function(cubeIndex){
			return cubes[cubeIndex];
		},
		getCubeCount: function(){
			return cubes.length;
		}
	}
}();
