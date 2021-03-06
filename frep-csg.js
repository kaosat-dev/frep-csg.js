var ALPHA = 0.0;
var EPS = 0.1e-5;
var sharpen = false;
var sharpenBreakoutMax = 8;
var refine1 = false;
var refine2 = false;
var refineDegree = 15;
var refineIterations = 2;
var highlightRefinements = false;
var showNormals = false;
var showGrid = false;
var gridMin = -10;
var gridMax = 10;
var showAxis = false;
var showOutlines = false;
var showBoundingBox = false;
var highlightColor = [0.8,0.8,1];

var projectedXmm = 150;
var resolutionXPixels = 800;
var resolutionYPixels = 600;
var DLP_EXPOSE = 'FFFFFF';
var DLP_MASK = '000000';

var MAX_BOUNDING_BOX = {min:{x:-200.0,y:-200.0,z:-200.0},max:{x:200.0,y:200.0,z:200.0}};
var MIN_BOUNDING_BOX_VALUE = 0.0
var MIN_BOUNDING_BOX = {min:{x:-MIN_BOUNDING_BOX_VALUE,y:-MIN_BOUNDING_BOX_VALUE,z:-MIN_BOUNDING_BOX_VALUE},max:{x:MIN_BOUNDING_BOX_VALUE,y:MIN_BOUNDING_BOX_VALUE,z:MIN_BOUNDING_BOX_VALUE}};
var DEFAULT_GRID_SIZE = 50;

var vertices = new Array();
var normals = new Array();
var indices = new Array();
var colors = new Array();



CSG = function(params, attrs, func) {
	this.params = params;
	this.attrs = attrs||{};
	this.func = func;
	this.funcDef = func.toString();	
}

function fileWriterErrorHandler(e) {
	var msg = '';
	switch (e.code) {
	  case FileError.QUOTA_EXCEEDED_ERR:
	    msg = 'QUOTA_EXCEEDED_ERR';
	    break;
	  case FileError.NOT_FOUND_ERR:
	    msg = 'NOT_FOUND_ERR';
	    break;
	  case FileError.SECURITY_ERR:
	    msg = 'SECURITY_ERR';
	    break;
	  case FileError.INVALID_MODIFICATION_ERR:
	    msg = 'INVALID_MODIFICATION_ERR';
	    break;
	  case FileError.INVALID_STATE_ERR:
	    msg = 'INVALID_STATE_ERR';
	    break;
	  default:
	    msg = 'Unknown Error';
	    break;
	};
	console.log(msg)
}

function pad(num, size) {
    var s = num+"";
    while (s.length < size) s = "0" + s;
    return s;
}

CSG.prototype = {
	call: function(coords){
		return this.func(coords, this.params, this.attrs);
	},	
	sliceToBMP: function(zSliceHeight, boundingBox, callback){

		var totalZheight = boundingBox.max.z - boundingBox.min.z;
		var zSliceCount = Math.round(totalZheight / zSliceHeight);

		notify("Z Slice Count: " + zSliceCount);

		var zip = new JSZip();
		var base64encode = function(){
		    // This is a non-standard extension available in Mozilla
		    // and possibly other browsers.
		    if (typeof window.btoa != "undefined")
		        return window.btoa;

		    /* JS fallback based on public domain code from Tyler Akins:
		        http://rumkin.com/tools/compression/base64.php */
		    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
		    function _btoa(data) {
		        var chr1, chr2, chr3, enc1, enc2, enc3,
		            i=0, length=data.length, output="";
		        while (i < length) {
		            // Convert 3 bytes of data into 4 6-bit chunks
		            chr1 = data.charCodeAt(i++);
		            chr2 = data.charCodeAt(i++);
		            chr3 = data.charCodeAt(i++);

		            enc1 = chr1 >> 2;                       // reduce byte to 6 bits
		            enc2 = ((chr1 & 3) << 4) | (chr2 >> 4); // last 2 bits of chr1 + first 4 of chr2
		            enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);// last 4 bits of chr2 + first 2 of chr3
		            enc4 = chr3 & 63;                       // last 6 bits

		            if (isNaN(chr2)) enc3 = enc4 = 64;      // pad with zeroes if necessary
		            else if (isNaN(chr3)) enc4 = 64;

		            output += chars.charAt(enc1) + chars.charAt(enc2) + chars.charAt(enc3) + chars.charAt(enc4);
		        }
		        return output;
		    }
		    return _btoa;
		}();
		var sliceCount = 0;
		for (var z = boundingBox.min.z; z <= boundingBox.max.z; z+=zSliceHeight) {
			var bmp = this.sliceToBMP_RLE8(z,boundingBox)

			// note to self - not too sure about this way of skipping any initially blank screens as it would also skip any blank screens in the middle of the model. Is this a problem?
			if (bmp){
				var filename = pad((sliceCount++),5)+".bmp"
				zip.file(filename, base64encode(bmp), {base64: true});
			}
		};

		var byteString = atob(zip.generate({base64:true}));

		var ab = new ArrayBuffer(byteString.length);
	    var ia = new Uint8Array(ab);
	    for (var i = 0; i < byteString.length; i++) {
	        ia[i] = byteString.charCodeAt(i);
	    }
		saveAs(new Blob([ab], { "type" : "application/zip" }), "out.3dlp.zip");

		callback();
	},
	sliceToBMP_RLE8: function(z, boundingBox){

		var pixarray = [];

		var aspectRatio = resolutionXPixels/resolutionYPixels;
		
		var projectedYmm = Math.round(projectedXmm/aspectRatio);

		var pixelsXPerMM = resolutionXPixels / projectedXmm;
		var pixelsYPerMM = resolutionYPixels / projectedYmm;

		var mmPerPixelX = projectedXmm / resolutionXPixels;
		var mmPerPixelY = projectedYmm / resolutionYPixels;

		var modelDistanceXmm = Math.abs(boundingBox.min.x)+Math.abs(boundingBox.max.x);
		var modelDistanceYmm = Math.abs(boundingBox.min.y)+Math.abs(boundingBox.max.y);

		var modelDistanceXpx = modelDistanceXmm * pixelsXPerMM;
		var modelDistanceYpx = modelDistanceYmm * pixelsYPerMM;

		var remainingXPixelCount = Math.max(0, resolutionXPixels - modelDistanceXpx);
		var remainingYPixelCount = Math.max(0, resolutionYPixels - modelDistanceYpx);

		var run = [DLP_MASK,0];
		var col;
		var isBlank = true;

		for (var y = 0; y < modelDistanceYpx; y++) {
			if (run[1] > 0) {
				pixarray.push(run);

				if (remainingXPixelCount > 0){
					pixarray.push([DLP_MASK,remainingXPixelCount]);	
				}
				
				run = [DLP_MASK, 0];
			}	

			var yPoint = boundingBox.min.y + (y * mmPerPixelY);		

			for (var x =0; x < modelDistanceXpx; x++){

				var xPoint = boundingBox.min.x + (x * mmPerPixelX);
				
				var result = this.call([xPoint,yPoint,z])[0]
				
				if (result >=0){
					col = DLP_EXPOSE;
					isBlank = false;
				} else {
					col = DLP_MASK;
				}

				if (run[0] == col){
					run[1]++;
				} else {
					pixarray.push(run);
					run = [col, 1];
				}
			}
		}

		if (isBlank){
			return undefined;
		}

		if (remainingYPixelCount > 0){
			for (var y2 = 0; y2 <= remainingYPixelCount; y2++){
				pixarray.push([DLP_MASK,resolutionXPixels]);
			}			
		}

		return bmp_rle8(resolutionXPixels, resolutionYPixels, pixarray)
	},
	polygonise: function(grid, boundingBox, isosurface, numWorkers, callback) {

		var grid = grid || {x:DEFAULT_GRID_SIZE,y:DEFAULT_GRID_SIZE,z:DEFAULT_GRID_SIZE}
		var boundingBox = boundingBox || {min:{x:-5.0,y:-5.0,z:-5.0},max:{x:5.0,y:5.0,z:5.0}};
		var isosurface = isosurface || 0.0;

		var numWorkers = numWorkers?numWorkers:4;
		var polygoniserWorkers = new Array(numWorkers);
		var resultsCount = 0;
		
		var verticesArray = new Array(numWorkers);
		var normalsArray = new Array(numWorkers);
		var indicesArray = new Array(numWorkers);
		var colorsArray = new Array(numWorkers);
		vertices = new Array();
		normals = new Array();
		indices = new Array();
		colors = new Array();
		var that = this;

		var division = (Math.abs(boundingBox.min.z)+boundingBox.max.z)/numWorkers;

		for (var i = 0; i <numWorkers; i++){
		
			polygoniserWorkers[i] = new Worker('PolygoniserWorker.js')			

			polygoniserWorkers[i].onmessage = function(e){
				
				if (e.data.msg != undefined) notify(e.data.msg);
				if (e.data.progress != undefined) incrementProgress(1);

				if (e.data.results != undefined) {

					var workerId = parseInt(e.data.worker)

					verticesArray[workerId] = e.data.results.vertices;
					normalsArray[workerId] = e.data.results.normals;
					indicesArray[workerId] = e.data.results.indices;
					colorsArray[workerId] = e.data.results.colors;

					resultsCount++;
					
					if (resultsCount == numWorkers){

						var offset = 0

						for(var h=0; h < numWorkers; h++){
							vertices = vertices.concat(verticesArray[h]);
							normals = normals.concat(normalsArray[h]);
							colors = colors.concat(colorsArray[h]);

							var indexArray = indicesArray[h];
							for (var k in indexArray){
								indices.push(parseInt(indexArray[k]) + offset)
							}
							offset += verticesArray[h].length
						}

						$('#currVertices').html(vertices.length)
						$('#currNormals').html(normals.length)
						$('#currColors').html(colors.length)
						$('#currIndices').html(indices.length)

						var mesh = new GL.Mesh({ normals: true, colors: true });

						/*  Add triangles along edges where normal angles > x deg  */
						if (refine1){

							refineIterationsCounter = refineIterations;	
							while  (refineIterationsCounter-- > 0){

								var indicesLength = indices.length
								for (var i = 2; i < indicesLength; i+=3) {

									var triIndex = [indices[i-2], indices[i - 1], indices[i]];
									var tri = [vertices[triIndex[0]], vertices[triIndex[1]], vertices[triIndex[2]]];
								
									var v1 = vertices[triIndex[0]];
									var v2 = vertices[triIndex[1]];
									var v3 = vertices[triIndex[2]];

									var n1 = normals[triIndex[0]];
									var n2 = normals[triIndex[1]];
									var n3 = normals[triIndex[2]];
									
									var r1 = that.call(v1)[0];
									var r2 = that.call(v2)[0];
									var r3 = that.call(v3)[0];

									var n1n2Radians = Math.acos(n1[0]*n2[0] + n1[1]*n2[1] + n1[2]*n2[2]);
									var n1n2Angle = (n1n2Radians / (2*Math.PI)) * 360;
									var n1n3Radians = Math.acos(n1[0]*n3[0] + n1[1]*n3[1] + n1[2]*n3[2]);
									var n1n3Angle = (n1n3Radians / (2*Math.PI)) * 360;
									var n2n3Radians = Math.acos(n2[0]*n3[0] + n2[1]*n3[1] + n2[2]*n3[2]);
									var n2n3Angle = (n2n3Radians / (2*Math.PI)) * 360;
									
									// Note: could probably do something better here than simply using the
									// average angle of the three normals.
									if ((n1n2Angle + n1n3Angle + n2n3Angle)/3 > refineDegree ) {

										var newVertex_v1v2 = [(v1[0]+v2[0])/2,(v1[1]+v2[1])/2,(v1[2]+v2[2])/2];
										var newVertex_v2v3 = [(v2[0]+v3[0])/2,(v2[1]+v3[1])/2,(v2[2]+v3[2])/2];
										var newVertex_v3v1 = [(v3[0]+v1[0])/2,(v3[1]+v1[1])/2,(v3[2]+v1[2])/2];

										vertices.push(newVertex_v1v2);
										var vertIndex1 = vertices.length-1;
										vertices.push(newVertex_v2v3);
										var vertIndex2 = vertices.length-1;
										vertices.push(newVertex_v3v1);
										var vertIndex3 = vertices.length-1;

										var newNormal_n1n2 = [(n1[0]+n2[0])/2,(n1[1]+n2[1])/2,(n1[2]+n2[2])/2];
										var newNormal_n2n3 = [(n2[0]+n3[0])/2,(n2[1]+n3[1])/2,(n2[2]+n3[2])/2];
										var newNormal_n3n1 = [(n3[0]+n1[0])/2,(n3[1]+n1[1])/2,(n3[2]+n1[2])/2];

										normals.push(newNormal_n1n2);
										normals.push(newNormal_n2n3);
										normals.push(newNormal_n3n1);

										if (highlightRefinements){
											colors.push(highlightColor);
											colors.push(highlightColor);
											colors.push(highlightColor);
										} else {
											var newColor_v1v2 = [(colors[triIndex[0]][0] + colors[triIndex[1]][0])/2,
																 (colors[triIndex[0]][1] + colors[triIndex[1]][1])/2,
																 (colors[triIndex[0]][2] + colors[triIndex[1]][2])/2];
											colors.push(newColor_v1v2);
											var newColor_v2v3 = [(colors[triIndex[1]][0] + colors[triIndex[2]][0])/2,
																 (colors[triIndex[1]][1] + colors[triIndex[2]][1])/2,
																 (colors[triIndex[1]][2] + colors[triIndex[2]][2])/2];
											colors.push(newColor_v2v3);
											var newColor_v3v1 = [(colors[triIndex[2]][0] + colors[triIndex[0]][0])/2,
																 (colors[triIndex[2]][1] + colors[triIndex[0]][1])/2,
																 (colors[triIndex[2]][2] + colors[triIndex[0]][2])/2];
											colors.push(newColor_v3v1);											

										}

										indices.push(triIndex[0], vertIndex1,  vertIndex3);
										indices.push(vertIndex1,  triIndex[1], vertIndex2);
										indices.push(vertIndex2,  triIndex[2], vertIndex3);
										indices.push(vertIndex1,  vertIndex2,  vertIndex3);

										delete indices[i-2];
										delete indices[i-1];
										delete indices[i];
									}
								}
								var tmpIndices = []
								for (var x=0; x<indices.length; x++){
									var index = indices[x]
									if (index != undefined){
										tmpIndices.push(index)
									}
								}

								indices = tmpIndices
								tmpIndices = undefined	
							}
						}


						/*  Add triangles in center where normal angles > x deg  */
						if (refine2) {

							refineIterationsCounter = refineIterations;
							
							while  (refineIterationsCounter-- > 0){

								var indicesLength = indices.length
								for (var i = 2; i < indicesLength; i+=3) {

									var triIndex = [indices[i-2], indices[i - 1], indices[i]];
									var tri = [vertices[triIndex[0]], vertices[triIndex[1]], vertices[triIndex[2]]];
								
									var v1 = vertices[triIndex[0]];
									var v2 = vertices[triIndex[1]];
									var v3 = vertices[triIndex[2]];

									var n1 = normals[triIndex[0]];
									var n2 = normals[triIndex[1]];
									var n3 = normals[triIndex[2]];
									
									var r1 = that.call(v1)[0];
									var r2 = that.call(v2)[0];
									var r3 = that.call(v3)[0];

									var n1n2Radians = Math.acos(n1[0]*n2[0] + n1[1]*n2[1] + n1[2]*n2[2]);
									var n1n2Angle = (n1n2Radians / (2*Math.PI)) * 360;
									var n1n3Radians = Math.acos(n1[0]*n3[0] + n1[1]*n3[1] + n1[2]*n3[2]);
									var n1n3Angle = (n1n3Radians / (2*Math.PI)) * 360;
									var n2n3Radians = Math.acos(n2[0]*n3[0] + n2[1]*n3[1] + n2[2]*n3[2]);
									var n2n3Angle = (n2n3Radians / (2*Math.PI)) * 360;
									
									// Note: could probably do something better here than simply using the
									// average angle of the three normals.
									if ((n1n2Angle + n1n3Angle + n2n3Angle)/3 > refineDegree ) {
									
										var newX = (v1[0]+v2[0]+v3[0])/3;
										var newY = (v1[1]+v2[1]+v3[1])/3;
										var newZ = (v1[2]+v2[2]+v3[2])/3;

										var newNormX = (n1[0]+n2[0]+n3[0])/3;
										var newNormY = (n1[1]+n2[1]+n3[1])/3;
										var newNormZ = (n1[2]+n2[2]+n3[2])/3;

										var newResult = that.call([newX, newY, newZ])[0];

										vertices.push([newX, newY, newZ]);
										var vertIndex = vertices.length-1;

										normals.push([newNormX, newNormY, newNormZ]);
										var normIndex = normals.length-1;

										if (highlightRefinements){
											colors.push(highlightColor);
										} else {
											var newColor = [(colors[triIndex[0]][0] + colors[triIndex[1]][0] + colors[triIndex[2]][0])/3,
																 (colors[triIndex[0]][1] + colors[triIndex[1]][1] + colors[triIndex[2]][1])/3,
																 (colors[triIndex[0]][2] + colors[triIndex[1]][2] + colors[triIndex[2]][2])/3];
											colors.push(newColor);
										}

										indices.push(vertIndex, triIndex[0], triIndex[1]);
										indices.push(vertIndex, triIndex[1], triIndex[2]);
										indices.push(vertIndex, triIndex[2], triIndex[0]);

										delete indices[i-2];
										delete indices[i-1];
										delete indices[i];
									}
								}

								var tmpIndices = []
								for (var x=0; x<indices.length; x++){
									var index = indices[x]
									if (index != undefined){
										tmpIndices.push(index)
									}
								}

								indices = tmpIndices
								tmpIndices = undefined	
							}

						}
						/*
						Move vertices along normal until function = 0.0	
						*/
						if (sharpen){
							truncateDecimals = function (number) {
							    return Math[number < 0 ? 'ceil' : 'floor'](number);
							};

							var verticesLength = vertices.length;
							for (var i = 0; i < verticesLength; i++) {
								var v = $.extend(true, [], vertices[i]);
								var n = normals[i];
								var r = that.call(v)[0]
								var breakout = sharpenBreakoutMax;

								var truncated = truncateDecimals(r.toFixed(4) * 1000) / 1000
								
								var rIn = truncated;

								while (Math.abs(truncated) != 0.0000 && breakout >= 0) {

									for (var i2 = 0; i2 < 3; i2++) {
										vertices[i][i2] += n[i2] * (r/3);
									}

									r = that.call(vertices[i])[0]

									truncated = truncateDecimals(r.toFixed(4) * 1000) / 1000

									breakout--
								} 

								/*
								if (rIn != truncated && truncated != 0.0000){
									console.log("rIn:", rIn, ", rOut:", truncated, ", iterations: ",sharpenBreakoutMax-breakout)
								}
								*/
								if (Math.abs(truncated)>Math.abs(rIn)){
								//	console.log("Extreme value, resetting.")
									vertices[i] = v;
								}
								
							}
						}

						for (var i = 2; i < indices.length; i+=3) {
							mesh.triangles.push([indices[i-2], indices[i - 1], indices[i]]);
						}

						mesh.vertices = vertices;
						mesh.normals = normals;
						mesh.colors = colors;
						mesh.computeWireframe();

						verticesArray = null;
						normalsArray = null;
						indicesArray = null;
						colorsArray = null;
						
						callback(mesh);
					}
				}
			}
			var bb = $.extend(true, {}, boundingBox);
			bb.min.z = boundingBox.min.z + (division*i);
			bb.max.z = bb.min.z + division;

			var subGrid = {x:grid.x, y:grid.y, z:(grid.z/numWorkers)};
			polygoniserWorkers[i].postMessage({'worker':i, 'boundingBox':bb, 'grid':subGrid, 'isosurface':isosurface, 'funcDef': this.funcDef, 'params':this.params, 'attrs':this.attrs})
		}
	},
	
	toStl: function(callback){
		if (vertices == undefined || vertices.length == 0){
			notify("No vertices found, Polygonise!")
			return;
		}

		var X = 0;
		var Y = 1;
		var Z = 2;
		
		var CB = new Array(3);
		var CA = new Array(3);
		var vec_length = 1;

		// Normal Vector for a facet
		var nx, ny, nz;

		var stlOutput = new Array()
		stlOutput.push("solid\n");

	    for (var i = 0; i < indices.length/3; i++) {
	    	incrementProgress(i);
			// Calculate a normal vector from the cross product
			CB[X] = vertices[indices[3*i + 1]][0] - vertices[indices[3*i + 2]][0];
			CB[Y] = vertices[indices[3*i + 1]][1] - vertices[indices[3*i + 2]][1];
			CB[Z] = vertices[indices[3*i + 1]][2] - vertices[indices[3*i + 2]][2];
			CA[X] = vertices[indices[3*i]][0] - vertices[indices[3*i + 2]][0];
			CA[Y] = vertices[indices[3*i]][1] - vertices[indices[3*i + 2]][1];
			CA[Z] = vertices[indices[3*i]][2] - vertices[indices[3*i + 2]][2];
			nx = CB[Y]*CA[Z] - CB[Z]*CA[Y];
			ny = CB[Z]*CA[X] - CB[X]*CA[Z];
			nz = CB[X]*CA[Y] - CB[Y]*CA[X];
			
			// Normalize the calculated normal vector
			vec_length = Math.sqrt(nx*nx + ny*ny + nz*nz);
			nx = nx / vec_length;
			ny = ny / vec_length;
			nz = nz / vec_length;
			
			stlOutput.push(" facet normal " + nx + " " + ny + " " + nz + "\n");
			stlOutput.push("  outer loop" + "\n"); 
			stlOutput.push("   vertex ");
			stlOutput.push(vertices[indices[3*i]][0] + " ");
			stlOutput.push(vertices[indices[3*i]][1] + " ");
			stlOutput.push(vertices[indices[3*i]][2] + "\n");
			stlOutput.push("   vertex ");
			stlOutput.push(vertices[indices[3*i + 1]][0] + " ");
			stlOutput.push(vertices[indices[3*i + 1]][1] + " ");
			stlOutput.push(vertices[indices[3*i + 1]][2] + "\n");
			stlOutput.push("   vertex ");
			stlOutput.push(vertices[indices[3*i + 2]][0] + " ");
			stlOutput.push(vertices[indices[3*i + 2]][1] + " ");
			stlOutput.push(vertices[indices[3*i + 2]][2] + "\n");
			stlOutput.push("  endloop" + "\n"); 
			stlOutput.push(" endfacet" + "\n"); 
	    }
	    
	    stlOutput.push("endsolid\n");

	    saveAs(new Blob(stlOutput, { "type" : "application\/sla" }), 'out.stl');
		callback();
	},
	union: function(otherCsg){
		this.manipulate([this.params, otherCsg.params],[this.attrs, otherCsg.attrs],
			"	var f1 = "+this.func.toString()+"(coords,params[0],attrs[0]);\
				var result1 = f1[0]; \
				var f2 = "+otherCsg.func.toString()+"(coords,params[1],attrs[1]); \
				var result2 = f2[0]; \
				var result = (1/(1+ALPHA))*(result2 + result1 + Math.sqrt(Math.abs(result2*result2 + result1*result1-2*ALPHA*result1*result2))); \
						\
				var attrs1 = f1[1];\
				var attrs2 = f2[1];\
				var attrs = {}; \
						\
				var col1 = attrs1.color || [1,1,1]; \
				var col2 = attrs2.color || [1,1,1]; \
				var unionCol = [1,1,1]; \
				if (result2.toFixed(2) >= 0.0 && result1.toFixed(2) >= 0.0) { \
					unionCol[0] = (col1[0] + col2[0]) / 2; \
					unionCol[1] = (col1[1] + col2[1]) / 2; \
					unionCol[2] = (col1[2] + col2[2]) / 2; \
				} else if (result1 > result2){ \
					unionCol = col1; \
				} else { \
					unionCol = col2; \
				} \
				attrs.color = unionCol; \
				return [result, attrs];");
		return this;
	},
	intersect: function(otherCsg){
		this.manipulate([this.params, otherCsg.params],[this.attrs, otherCsg.attrs],
		"	var f1 = "+this.func.toString()+"(coords,params[0],attrs[0]);\
			var result1 = f1[0]; \
			var f2 = "+otherCsg.func.toString()+"(coords,params[1],attrs[1]); \
			var result2 = f2[0]; \
			var result = (1/(1+ALPHA))*(result2 + result1 - Math.sqrt(Math.abs(result2*result2 + result1*result1 - 2*ALPHA*result1*result2))); \
			return [result, _.extend({}, f2[1], f1[1])]");
		return this;
	},
	subtract: function(otherCsg){
		this.manipulate([this.params, otherCsg.params],[this.attrs, otherCsg.attrs],
			"	var f1 = "+this.func.toString()+"(coords,params[0],attrs[0]);\
				var result1 = f1[0]; \
				var f2 = "+otherCsg.func.toString()+"(coords,params[1],attrs[1]); \
				var result2 = f2[0]; \
				result2 = -result2; \
				var result = (1/(1+ALPHA))*(result2 + result1 - Math.sqrt(Math.abs(result2*result2 + result1*result1 - 2*ALPHA*result1*result2))); \
				return [result, _.extend({}, f2[1], f1[1])]; \
				");
		return this;
	},
	manipulate: function(params, attrs, funcDef) {
		this.params = params;
		this.attrs = attrs;
		this.func = new Function('coords', 'params', 'attrs', funcDef);
		this.funcDef = this.func.toString();
	},
	//	RotateX
	//	Definition: inverse mapping
    //		y'=y*cos(theta)+z*sin(theta)
    //		z'=-y*sin(theta)+z*cos(theta)
    //	Parameters:
    //		theta - rotation angle in radians
	rotateX: function(p){
		this.manipulate([this.params, p], this.attrs, 
			"	var theta = params[1].theta; \
				var ct = Math.cos(theta); \
				var st = Math.sin(theta); \
				var yr = coords[1] * ct + coords[2] * st;\
				var zr = -coords[1] * st + coords[2] * ct;\
				var newcoords = []; \
				newcoords[0] = coords[0]; \
				newcoords[1] = yr;\
				newcoords[2] = zr;\
				return "+this.func.toString()+"(newcoords,params[0],attrs);\
				");
		return this;
	},
	//	RotateY
	//	Definition: inverse mapping
    //		z'=z*cos(theta)+x*sin(theta)
    //		x'=-z*sin(theta)+z*cos(theta)
    //	Parameters:
    //		theta - rotation angle in radians
	rotateY: function(p){
		this.manipulate([this.params, p], this.attrs, 
			"	var theta = params[1].theta; \
				var ct = Math.cos(theta); \
				var st = Math.sin(theta); \
				var zr = coords[2] * ct + coords[0] * st; \
				var xr = -coords[2] * st + coords[0] * ct; \
				var newcoords = []; \
				newcoords[0] = xr; \
				newcoords[1] = coords[1]; \
				newcoords[2] = zr; \
				return "+this.func.toString()+"(newcoords,params[0],attrs);\
					");
		return this;
	},
	//	RotateZ
	//	Definition: inverse mapping
    //		x'=x*cos(theta)+y*sin(theta)
    //		y'=-x*sin(theta)+y*cos(theta)
    //	Parameters:
    //		theta - rotation angle in radians
	rotateZ: function(p){
		this.manipulate([this.params, p], this.attrs, 
			"	var theta = params[1].theta; \
				var ct = Math.cos(theta); \
				var st = Math.sin(theta); \
				var xr = coords[0] * ct + coords[1] * st; \
				var yr = -coords[0] * st + coords[1] * ct; \
				var newcoords = []; \
				newcoords[0] = xr; \
				newcoords[1] = yr; \
				newcoords[2] = coords[2]; \
				return "+this.func.toString()+"(newcoords,params[0],attrs);\
				");
		return this;
	},
	//	TwistX
	//	Definition: inverse mapping
    //		t = (x-x1)/(x2-x1)
    //		theta = (1-t)*theta1 + t*theta2
    //		y'=y*cos(theta)+z*sin(theta)
    //		z'=-y*sin(theta)+z*cos(theta)
	//	Parameters:
	//		x1, x2 - end points of x-interval
 	//		theta1, theta2 - rotation angles in radians for end points
	twistX: function(p){
		this.manipulate([this.params, p], this.attrs, 
			"	var theta1 = params[1].theta1; \
				var theta2 = params[1].theta2; \
				var x1 = params[1].x1; \
				var x2 = params[1].x2; \
				var t = (coords[0]-x1)/(x2-x1); \
				var theta = (1-t)*theta1 + t*theta2; \
				var ct = Math.cos(theta); \
				var st = Math.sin(theta); \
				var yr = coords[1] * ct + coords[2] * st; \
				var zr = -coords[1] * st + coords[2] * ct; \
				var newcoords = []; \
				newcoords[0] = coords[0]; \
				newcoords[1] = yr; \
				newcoords[2] = zr; \
				return "+this.func.toString()+"(newcoords,params[0],attrs);\
				");
		return this;
	},
	//	TwistY
	//	Definition: inverse mapping
	//		t = (y-y1)/(y2-y1)
	//		theta = (1-t)*theta1 + t*theta2
	//		z'=z*cos(theta)+x*sin(theta)
	//		x'=-z*sin(theta)+x*cos(theta)
	//	Parameters:
	//		y1, y2 - end points of y-interval
	//		theta1, theta2 - rotation angles in radians for end points
	twistY: function(p){
		this.manipulate([this.params, p], this.attrs, 
			"	var theta1 = params[1].theta1; \
				var theta2 = params[1].theta2; \
				var y1 = params[1].y1; \
				var y2 = params[1].y2; \
				var t = (coords[1]-y1)/(y2-y1); \
				var theta = (1-t)*theta1 + t*theta2; \
				var ct = Math.cos(theta); \
				var st = Math.sin(theta); \
				var zr = coords[2] * ct + coords[0] * st; \
				var xr = -coords[2] * st + coords[0] * ct; \
				var newcoords = []; \
				newcoords[0] = xr; \
				newcoords[1] = coords[1]; \
				newcoords[2] = zr; \
				return "+this.func.toString()+"(newcoords,params[0],attrs);\
				");
		return this;
	},
	//	TwistZ
	//	Definition: inverse mapping
	//		t = (z-z1)/(z2-z1)
	//		theta = (1-t)*theta1 + t*theta2
	//		x'=x*cos(theta)+y*sin(theta)
	//		y'=-x*sin(theta)+y*cos(theta)
	//	Parameters:
	//		z1, z2 - end points of z-interval
	//		theta1, theta2 - rotation angles in radians for end points
	twistZ: function(p){
		this.manipulate([this.params, p], this.attrs, 
			"	var theta1 = params[1].theta1; \
				var theta2 = params[1].theta2; \
				var z1 = params[1].z1; \
				var z2 = params[1].z2; \
				var t = (coords[2]-z1)/(z2-z1); \
				var theta = (1-t)*theta1 + t*theta2; \
				var ct = Math.cos(theta); \
				var st = Math.sin(theta); \
				var xr = coords[0] * ct + coords[1] * st; \
				var yr = -coords[0] * st + coords[1] * ct; \
				var newcoords = []; \
				newcoords[0] = xr; \
				newcoords[1] = yr; \
				newcoords[2] = coords[2]; \
				return "+this.func.toString()+"(newcoords,params[0],attrs);\
				");
		return this;
	},
	//	Shift
	//	Definition: x'=x+dx
	//	Parameters:
 	//		dx,dy,dz - shift factors along axes
	shift: function(p){
		this.manipulate([this.params, p], this.attrs, 
			"   var dx = params[1].dx; \
				var dy = params[1].dy; \
				var dz = params[1].dz; \
				var newcoords = []; \
				newcoords[0] = coords[0] - dx; \
				newcoords[1] = coords[1] - dy; \
				newcoords[2] = coords[2] - dz; \
				return "+this.func.toString()+"(newcoords,params[0],attrs);\
				");
		return this;
	},
	//	Stretch
	//	Definition: x'=x0+(x-x0)/scale  (inverse mapping)
	//	Parameters:
	//		x0 - reference point for stretching
 	//		sx,sy,sz - scaling factors along axes
 	stretch: function(p){
		this.manipulate([this.params, p], this.attrs, 
			"	var x0 = params[1].x0; \
				var sx = params[1].sx; \
				var sy = params[1].sy; \
				var sz = params[1].sz; \
				var newcoords = []; \
				newcoords[0] = x0[0] + (coords[0] - x0[0]) / sx; \
				newcoords[1] = x0[1] + (coords[1] - x0[1]) / sy; \
				newcoords[2] = x0[2] + (coords[2] - x0[2]) / sz; \
				return "+this.func.toString()+"(newcoords,params[0],attrs);\
			");
		return this;
	},
	//	Scale
	//	Definition: x'=sx*x
	//	Parameters:
	//		sx,sy,sz - scaling factors along axes
	scale: function(p){
		this.manipulate([this.params, p], this.attrs, 
			"	var newcoords = []; \
				newcoords[0] = coords[0] / params[1].sx; \
				newcoords[1] = coords[1] / params[1].sy; \
				newcoords[2] = coords[2] / params[1].sz; \
				return "+this.func.toString()+"(newcoords,params[0],attrs);\
			");
		return this;
	},
	//	TaperX
	//	Definition: inverse mapping
	//		x1<= x <= x2
	//			t = (x-x1)/(x2-x1)
	//			scale = (1-t)*s1 + t*s2
	//			y'=y/scale
	//			z'=z/scale
	//		x < x1   scale = s1
	//		x > x2   scale = s2
	//	Parameters:
	//		x1, x2 - end points of x-interval, x2 > x1
 	//		s1, s2 - scaling factors for end points
	taperX: function(p){
		this.manipulate([this.params, p], this.attrs, 
			"	var scale, t;            \
				var s2 = params[1].s2;   \
				var s1 = params[1].s1;   \
				var x2 = params[1].x2;   \
				var x1 = params[1].x1;   \
									     \
				if (coords[0] < x1) {    \
					scale = s1;          \
				} else {                 \
					if(coords[0] > x2) { \
						scale = s2;      \
					} else {             \
						t = (coords[0] - x1) / (x2 - x1); \
						scale = (1-t)*s1 + t*s2; \
					}                    \
				}                        \
				if(Math.abs(scale) < EPS) scale = 1.0; \
				var newcoords = []; \
				newcoords[0] = coords[0]; \
				newcoords[1] = coords[1] / scale; \
				newcoords[2] = coords[2] / scale; \
				return "+this.func.toString()+"(newcoords,params[0],attrs);\
			");
		return this;
	},
	//	TaperY
	//	Definition: inverse mapping
	//		y1<= y <= y2
	//			t = (y-y1)/(y2-y1)
	//			scale = (1-t)*s1 + t*s2
	//			z'=z/scale
	//			x'=x/scale
	//		y < y1   scale = s1
	//		y > y2   scale = s2
	//	Parameters:
	//		y1, y2 - end points of y-interval, y2 > y1
 	//		s1, s2 - scaling factors for end points
	taperY: function(p){
		this.manipulate([this.params, p], this.attrs, 
			"	var scale, t;            \
				var s2 = params[1].s2;   \
				var s1 = params[1].s1;   \
				var y2 = params[1].y2;   \
				var y1 = params[1].y1;   \
									     \
				if (coords[1] < y1) {    \
					scale = s1;          \
				} else {                 \
					if(coords[1] > y2) { \
						scale = s2;      \
					} else {             \
						t = (coords[1] - y1) / (y2 - y1); \
						scale = (1-t)*s1 + t*s2; \
					}                    \
				}                        \
				if(Math.abs(scale) < EPS) scale = 1.0; \
				var newcoords = []; \
				newcoords[0] = coords[0] / scale; \
				newcoords[1] = coords[1]; \
				newcoords[2] = coords[2] / scale; \
				return "+this.func.toString()+"(newcoords,params[0],attrs);\
			");
		return this;
	},
	//	TaperZ
	//	Definition: inverse mapping
	//		z1<= z <= z2
	//			t = (z-z1)/(z2-z1)
	//			scale = (1-t)*s1 + t*s2
	//			x'=x/scale
	//			y'=y/scale
	//		z < z1   scale = s1
	//		z > z2   scale = s2
	//	Parameters:
	//		z1, z2 - end points of z-interval, z2 > z1
 	//		s1, s2 - scaling factors for end points
	taperZ: function(p){
		this.manipulate([this.params, p], this.attrs, 
			"	var scale, t;            \
				var s2 = params[1].s2;   \
				var s1 = params[1].s1;   \
				var z2 = params[1].z2;   \
				var z1 = params[1].z1;   \
									     \
				if (coords[2] < z1) {    \
					scale = s1;          \
				} else {                 \
					if(coords[2] > z2) { \
						scale = s2;      \
					} else {             \
						t = (coords[2] - z1) / (z2 - z1); \
						scale = (1-t)*s1 + t*s2; \
					}                    \
				}                        \
				if(Math.abs(scale) < EPS) scale = 1.0; \
				var newcoords = []; \
				newcoords[0] = coords[0] / scale; \
				newcoords[1] = coords[1] / scale; \
				newcoords[2] = coords[2]; \
				return "+this.func.toString()+"(newcoords,params[0],attrs);\
			");
		return this;
	},
	clone: function(){
		return new CSG(_.extend({}, this.params), _.extend({}, this.attrs), this.func);
	},
	setAttributes: function(attrs){
		this.attrs = attrs;
		return this;
	},
	setParameters: function(params){
		this.params = params;
		return this;
	},
	setAttribute: function(name, value){
		if (this.attrs == undefined){
			this.attrs = {};
		}
		this.attrs[name] = value;
		return this;
	},
	getAttribute: function(name){
		if (this.attrs == undefined){
			return undefined;
		}
		return this.attrs[name];
	},
	setParameter: function(name, value){
		if (this.params == undefined){
			this.params = {};
		}
		this.params[name] = value;
		return this;
	},
	getParameter: function(name){
		if (this.params == undefined){
			return undefined;
		}
		return this.params[name];
	}
};

/**Shapes **/

//	Block
//	Definition: x:[vertex[1], vertex[1]+dx], ...
//	Parameters:
//		vertex - block vertex coordinates array
//		dx,dy,dz - edge lengths along x,y,z
CSG.block = function(params, attrs) {
	return new CSG(params, attrs, function(coords, params, attrs){
		var vertex = params.vertex; 
		var dx = params.dx; 
		var dy = params.dy; 
		var dz = params.dz; 
		var x0 = -(coords[0] - vertex[0]) * (coords[0] - (vertex[0] + dx)); 
		var y0 = -(coords[1] - vertex[1]) * (coords[1] - (vertex[1] + dy)); 
		var z0 = -(coords[2] - vertex[2]) * (coords[2] - (vertex[2] + dz)); 
		var i0 = x0 + y0 - Math.sqrt(x0 * x0 + y0 * y0); 
		result = i0 + z0 - Math.sqrt(i0 * i0 + z0 * z0); 
		return [result, attrs];
	});
};


//	Sphere
//	Definition: R^2-(x-x0)^2-(y-y0)^2-(z-z0)^2
//	Parameters:
//		center - sphere center array
//		R - sphere radius
CSG.sphere = function(params, attrs) {
	return new CSG(params, attrs, function(coords, params, attrs){
		var R = params.radius;
		var x = coords[0] - params.center[0]; 
		var y = coords[1] - params.center[1]; 
		var z = coords[2] - params.center[2]; 
		var result = (R * R) - (x * x) - (y * y) - (z * z);
		return [result, attrs];
		});
};

//	Torus with X-axis
//	Parameters:
//		center - center array
//		R - radius of revolution
//		r0 - disk radius	
CSG.torusX = function(params, attrs) {
	return new CSG(params, attrs, function(coords, params, attrs){
		var R = params.R; 
		var r0 = params.r0; 
		var x = coords[0] - params.center[0]; 
		var y = coords[1] - params.center[1]; 
		var z = coords[2] - params.center[2]; 
		var result = (r0 * r0) - (x * x) - (y * y) - (z * z) - (R * R) + 2 * R * Math.sqrt((y * y) + (z * z)); 
		return [result, attrs];
	});
};

//	Torus with Y-axis
//	Parameters:
//		center - center array
//		R - radius of revolution
//		r0 - disk radius
CSG.torusY = function(params, attrs) {
	return new CSG(params, attrs, function(coords, params, attrs){
		var R = params.R; 
		var r0 = params.r0; 
		var x = coords[0] - params.center[0];
		var y = coords[1] - params.center[1];
		var z = coords[2] - params.center[2]; 
		var result =  (r0 * r0) - (x * x) - (y * y) - (z * z) - (R * R) + 2 * R * Math.sqrt((x * x) + (z * z));
		return [result, attrs];
	});
};

//	Torus with Z-axis
//	Parameters:
//		center - center array
//		R - radius of revolution
//		r0 - disk radius
CSG.torusZ = function(params, attrs) {
	return new CSG(params, attrs, function(coords, params, attrs){
		var R = params.R; 
		var r0 = params.r0; 
		var x = coords[0] - params.center[0]; 
		var y = coords[1] - params.center[1]; 
		var z = coords[2] - params.center[2]; 
		var result =  (r0 * r0) - (x * x) - (y * y) - (z * z) - (R * R) + 2 * R * Math.sqrt((x * x) + (y * y)); 
		return [result, attrs];
	});
};

CSG.gyroid = function(params, attrs) {
	return new CSG(params, attrs, function(coords, params, attrs){
		var x = coords[0] - params.center[0]; 
		var y = coords[1] - params.center[1]; 
		var z = coords[2] - params.center[2]; 
        var r = x * x + y * y + z * z; 
        var	ti = Math.abs(Math.sin(params.t / 100000)) / 10 + 0.06; 
        var v = ti * r; 
        var result =  (Math.cos(x / v) * Math.sin(y / v) + Math.cos(y / v) * Math.sin(z / v)  + Math.cos(z / v) * Math.sin(x / v) + 1.0) - 0.1 * (1 - 0.016 * (r - 10 / r)); 
		return [result, attrs];
	});
};

//	EllipticCylinderX
//	Definition: 1-((y-y0)/a)^2-((z-z0)/b)^2
//	Parameters:
//		center - center array
//		a,b - elliptic half-axes along y,z		
CSG.ellipticCylinderX = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var yt = (coords[1] - params.center[1]) / params.a;
		var zt = (coords[2] - params.center[2]) / params.b;
		var result =  1.0 - yt * yt - zt * zt;
		return [result, attrs];
	});
};

//	EllipticCylinderY
//	Definition: 1-((x-x0)/a)^2-((z-z0)/b)^2
//	Parameters:
//		center - center array
//		a,b - elliptic half-axes along x,z
CSG.ellipticCylinderY = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var xt = (coords[0] - params.center[0]) / params.a;
		var zt = (coords[2] - params.center[2]) / params.b;
		var result =  1.0 - xt * xt - zt * zt;
		return [result, attrs];
	});
};

//	EllipticCylinderZ
//	Definition: 1-((x-x0)/a)^2-((y-y0)/b)^2
//	Parameters:
//		center - center array
//		a,b - elliptic half-axes along x,y
CSG.ellipticCylinderZ = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var xt = (coords[0] - params.center[0]) / params.a;
		var yt = (coords[1] - params.center[1]) / params.b;
		var result =  1.0 - xt * xt - yt * yt;
		return [result, attrs];
	});
};

//	Ellipsoid
//	Definition: 1-((x-x0)/a)^2-((y-y0)/b)^2-((z-z0)/c)^2
//	Parameters:
//		center - center array
//		a,b,c - ellipsoid half-axes along x,y,z
CSG.ellipsoid = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var x = (coords[0] - params.center[0]) / params.a; 
		var y = (coords[1] - params.center[1]) / params.b; 
		var z = (coords[2] - params.center[2]) / params.c; 
        var result =  1 - (x * x) - (y * y) - (z * z); 
		return [result, attrs];
	});
};

// CylinderX
// Definition: R^2-(y-y0)^2-(z-z0)^2
// Parameters:
//		center - center array
//		R - cylinder radius
CSG.cylinderX = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var y = coords[1] - params.center[1];
		var z = coords[2] - params.center[2]; 
        var result =  (params.R * params.R) - (y * y) - (z * z); 
		return [result, attrs];
	});
};

// CylinderY
// Definition: R^2-(x-x0)^2-(z-z0)^2
// Parameters:
//		center - center array
//		R - cylinder radius
CSG.cylinderY = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var x = coords[0] - params.center[0]; 
		var z = coords[2] - params.center[2]; 
        var result =  (params.R * params.R) - (x * x) - (z * z); 
		return [result, attrs];
	});
};

// CylinderZ
// Definition: R^2-(x-x0)^2-(y-y0)^2
// Parameters:
//		center -  center array
//		R - cylinder radius
CSG.cylinderZ = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var x = coords[0] - params.center[0]; 
		var y = coords[1] - params.center[1]; 
        var result =  (params.R * params.R) - (x * x) - (y * y); 
		return [result, attrs];
	});
};

CSG.heart = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var x = (coords[0] - params.center[0]); 
		var y = (coords[1] - params.center[1]); 
		var z = (coords[2] - params.center[2]); 
		var pow = Math.pow; 
		var result =  pow(pow(x,2)+(9/4)*pow(y,2)+pow(z,2)-1,3) - pow(x,2)*pow(z,3)-(9/80)*pow(y,2)*pow(z,3); 
		return [result, attrs];
	});
};

// Primitive: Cone with x-axis 
// Definition: (x-x0)^2-((y-y0)/R)^2-((z-z0)/R)^2
// Parameters:
//		center - center array
//		R - radius at height 1 
CSG.coneX = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var xt = (coords[0] - params.center[0]);
		var yt = (coords[1] - params.center[1]) / params.R;
		var zt = (coords[2] - params.center[2]) / params.R;
		var result =  rn (xt*xt) - (yt*yt) - (zt*zt);
		return [result, attrs];
	});
};

// Primitive: Cone with y-axis 
// Definition: (y-y0)^2-((x-x0)/R)^2-((z-z0)/R)^2
// Parameters:
//		center - center array
//		R - radius at height 1 
CSG.coneY = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var xt = (coords[0] - params.center[0]) / params.R;
		var yt = (coords[1] - params.center[1]);
		var zt = (coords[2] - params.center[2]) / params.R;
		var result =  (yt*yt) - (xt*xt) - (zt*zt);
		return [result, attrs];
	});
};

// Primitive: Cone with z-axis 
// Definition: (z-z0)^2-((x-x0)/R)^2-((y-y0)/R)^2
// Parameters:
//		center - center array
//		R - radius at height 1 
CSG.coneZ = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var xt = (coords[0] - params.center[0]) / params.R;
		var yt = (coords[1] - params.center[1]) / params.R;
		var zt = (coords[2] - params.center[2]);
		var result =  (zt*zt) - (xt*xt) - (yt*yt);
		return [result, attrs];
	});
};


// Catenoid
// Definition: x^2 + y^2 − cosh( z )^2
// Parameters:
//		center - center array
CSG.catenoid = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var cosh = function(x) {return (Math.pow(Math.E, x)+Math.pow(Math.E, -x))/2;};
		var x = coords[0] - params.center[0];
		var y = coords[1] - params.center[1];
		var z = coords[2] - params.center[2];
		var result = Math.pow(x,2) + Math.pow(y,2) - Math.pow(cosh( z ),2);

		return [result, attrs];
	});
};

// Helicoid
// Definition: cos( z ) y − x sin( z )
// Parameters:
//		center - center array
CSG.helicoid = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var x = coords[0] - params.center[0];
		var y = coords[1] - params.center[1];
		var z = coords[2] - params.center[2];

		var result = Math.cos(z)*y - x*Math.sin(z);

		return [result, attrs];
	});
};

// Orthocircles
// from http://xahlee.org/surface/orthocircles/orthocircles.html
// Parameters:
//		center - center array
//		ff
// 		bb
CSG.orthocircles = function(params, attrs){
	params = params || {};
	params.center = params.center || [0,0,0];

	return new CSG(params, attrs, function(coords, params, attrs){
		var x = coords[0] - params.center[0];
		var y = coords[1] - params.center[1];
		var z = coords[2] - params.center[2];
		    
		var pow = Math.pow;
		var ff = params.ff||0.075;
		var bb = params.bb||3;

		var result = (pow((pow(x,2) + pow(y,2) - 1),2) + pow(z,2))*(pow((pow(y,2) + pow(z,2) - 1),2) + pow(x,2))*(pow((pow(z,2) + pow(x,2) - 1),2) + pow(y,2))-pow(ff,2)*(1 + bb*(pow(x,2) + pow(y,2) + pow(z,2)));

		return [result, attrs];
	});	
};

// Primitive: Blobby object (Blinn 1982)
// Definition: Sum b*exp(-a*r^2)-T
// Parameters:
//		bc - arrays of blob centers [[x,y,z],...]
//		a - array of a coefficients
//		b - array of b coefficients
//		T - threshold value
CSG.blobbyball = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){
		var x = coords[0];
		var y = coords[1];
		var z = coords[2];

		var blobcenters = params.bc;
		var a = params.a;
		var b = params.b;
		var T = params.T;

		if (blobcenters.length == 0) {
			result = -1111111111111.0;
		} else {
			var blobby = 0.0;
			for(i=0; i<blobcenters.length; i++)
			{
				var blobcenter = blobcenters[i];
				var xt = x - blobcenter[0];
				var yt = y - blobcenter[1];
				var zt = z - blobcenter[2];
				blobby = blobby + b[i]*Math.exp(-a[i]*(xt*xt+yt*yt+zt*zt));
			}			
			var result = (blobby - T);
		}		

		return [result, attrs];
	});	
};

// Primitive:  Cauchy Line with Convolution Surface
// Definition:  1 / (1 + S^2*R^2)^2
//				R is the distance between primitive and x
// Parameters:  T - threshold value
//              S - control value for width of the kernel
//              end - ending points coordinate array [[x,y,z],...]
//              begin - beginning points coordinate array [[x,y,z],...]
CSG.convLine = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){

		var T = params.T;
		var S = params.S;
		var endPoints = params.end;
		var beginPoints = params.begin;

		var x = coords[0];
		var y = coords[1];
		var z = coords[2];

		var SQ = function(x){ return ((x)*(x)); };
		var f = 0.0;
		var l,ax,ay,az,dx,dy,dz,xx,p,q, endPoint, startPoint;

		for(var n=0;n<S.length;n++) {
			end = endPoints[n]; 
			begin = beginPoints[n];
			l = Math.sqrt(SQ(end[0] - begin[0]) + SQ(end[1] - begin[1]) + SQ(end[2] - begin[2]));

			if(l == 0.0) {
			  console.error("ERROR:Tips of the segment take same coordinate!\n");
			  return;
			}

			ax = (end[0] - begin[0]) / l;
			ay = (end[1] - begin[1]) / l;
			az = (end[2] - begin[2]) / l;

			dx = x - begin[0];
			dy = y - begin[1];
			dz = z - begin[2];

			xx = dx*ax + dy*ay + dz*az;
			p = Math.sqrt(1 + S[n]*S[n] * ( dx*dx + dy*dy + dz*dz - xx*xx));
			q = Math.sqrt(1 + S[n]*S[n] * ( dx*dx + dy*dy + dz*dz + l*l - 2*l*xx ));

			f += xx / (2*p*p*(p*p + S[n]*S[n]*xx*xx)) + (l - xx) / (2*p*p*q*q)
			  + (Math.atan(S[n]*xx/p) + Math.atan(S[n]*(l - xx)/p)) / (2*S[n]*p*p*p);

		}

		var result = f - T;

		return [result, attrs];

	});	
};


// Primitive:  Cauchy Arc with Convolution Surface
// Definition:  1 / (1 + S^2*R^2)^2
//				R is the distance between primitive and x
// Parameters:  T - threshold value
// 				S - control value for width of the kernel
// 				rotate_angles - rotate angle
// 				rotate_axes - rotate axis [[x,y,z],...]
// 				theta - arc angle
// 				radius - arc radius
// 				centers - center of arc [[x,y,z],...]
// By: Ken Yoshikawa
CSG.convArc = function(params, attrs){
	return new CSG(params, attrs, function(coords, params, attrs){

		var T = params.T;
		var S = params.S;
		
		var angle = params.rotate_angles;
		var axes = params.rotate_axes;
		var theta = params.theta;
		var radius = params.radius;
		var centers = params.centers;


		var x = coords[0];
		var y = coords[1];
		var z = coords[2];

		var SQ = function(x){ return ((x)*(x)); };
		var QU = function(x){ return (SQ(x)*SQ(x)); };

		var r, th, rd = Math.PI/180.0;
  		var f1, f2, d2, b, a, p1, p2, p3, f=0.0;
		var i,j,k,c,s,ii,jj,kk,ij,jk,ki,is,js,ks,one_c,length;
		var cx,cy,cz,new_x,new_y,new_z;
		var tempx,tempy,tempz;
		var over_i=0.0,over_j=0.0,over_k=1.0,over_th,over_c,over_s,
			over_one_c,over_ii,over_jj,over_kk,over_ij,over_jk,over_ki,
			over_is,over_js,over_ks,over_x,over_y,over_z,center,axis;

		var sin = Math.sin;
		var cos = Math.cos;
		var sqrt = Math.sqrt;
		var tan = Math.tan;
		var atan = Math.atan;
		var atanh = function(x) {return 0.5 * Math.log((1 + x)/(1 - x));};

		for(var n=0; n<S.length; n++) {
			center = centers[n];
			cx = center[0];    /* Center of Arc */
			cy = center[1];
			cz = center[2];

			r = radius[n];
			angle[n] += EPS;  /* avoid error */

			axis = axes[n];
			i = axis[0] + EPS; /* avoid error */
			j = axis[1] + EPS; /* avoid error */
			k = axis[2] + EPS; /* avoid error */

			length = sqrt(i*i + j*j + k*k);
			if( length < EPS ) {
			  length = EPS;
			}

			i /= length;   /* Calculate normal vector around which Arc rotates */
			j /= length;
			k /= length;

			c = cos(rd * (-angle[n]));
			s = sin(rd * (-angle[n]));

			one_c = 1.0 - c;

			ii = i*i;  jj = j*j;  kk = k*k;
			ij = i*j;  jk = j*k;  ki = k*i;
			is = i*s;  js = j*s;  ks = k*s;

			if(theta[n] > 360.0)
			  theta[n] = 360.0;

			/********** [Begin] over PI operation ***************************/
			if(theta[n] > 180.0) {
			  over_th = (theta[n] - 180.0)*rd;
			  theta[n] = 180.0;
			  
			  /* rotate by -angle */
			  tempx = (c + ii * one_c)*(x-cx) + (-ks + ij * one_c)*(y-cy) + (js + ki * one_c)*(z-cz);
			  tempy = (ks + ij * one_c)*(x-cx) +  (c + jj * one_c)*(y-cy) + (-is + jk * one_c)*(z-cz);
			  tempz = (-js + ki * one_c)*(x-cx) + (is + jk * one_c)*(y-cy) + (c + kk * one_c)*(z-cz);

			  /************* [Begin] rotate -PI operation **********************/
			  over_c = cos(rd * (-180.0));
			  over_s = sin(rd * (-180.0));
			  over_one_c = 1.0 - over_c;

			  over_ii = SQ(over_i); over_jj = SQ(over_j); over_kk = SQ(over_k);
			  over_ij = over_i*over_j; over_jk = over_j*over_k; over_ki = over_k*over_i;
			  over_is = over_i*over_s; over_js = over_j*over_s; over_ks = over_k*over_s;

			  over_x = (over_c + over_ii * over_one_c)*(tempx) + (-over_ks + over_ij * over_one_c)*(tempy) + (over_js + over_ki * over_one_c)*(tempz);
			  over_y = (over_ks + over_ij * over_one_c)*(tempx) + (over_c + over_jj * over_one_c)*(tempy) + (-over_is + over_jk * over_one_c)*(tempz);
			  over_z = (-over_js + over_ki * over_one_c)*(tempx) + (over_is + over_jk * over_one_c)*(tempy) + (over_c + over_kk * over_one_c)*(tempz);
			  /************* [End] rotate -PI operation **********************/

			  a = 2.0*r*S[n]*S[n];
			  d2 = SQ(over_x) + SQ(over_y) + SQ(over_z);
			  b = 1.0 + SQ(r)*SQ(S[n]) + SQ(S[n])*d2;
			  p2 = -QU(r)*QU(S[n]) + 2.0*SQ(r)*SQ(S[n])*(SQ(S[n])*(d2 - 2.0*SQ(over_z)) - 1.0) - SQ(1.0 + SQ(S[n])*d2);
			  p1 = (p2 < 0.0) ? sqrt(-p2) : sqrt(p2);
			  p3 = p1*p2;
			  
			  f1 = (b*over_y) / (over_x*p2*(a*over_x-b)) + (a*(SQ(over_x) + SQ(over_y))*sin(over_th) - b*over_y) / (over_x*p2*(a*(over_x*cos(over_th) + over_y*sin(over_th)) - b));
			  
			  if(p2 < 0.0) {
			  	f2 = 2.0*b*(atan(-a*over_y/p1) + atan((a*over_y - (a*over_x + b)*tan(over_th/2.0)) / p1)) / p3;
			  } else {
			  	f2 = 2.0*b*(atanh(a*over_y/p1) + atanh(((a*over_x + b)*tan(over_th/2.0) - a*over_y) / p1)) / p3;
			  }

			  f += f1 + f2;
			}
			/********** [End] over PI operation ***************************/

			th = theta[n]*rd;
			new_x = (c + ii * one_c)*(x -cx) + (-ks + ij * one_c)*(y-cy) + (js + ki * one_c)* (z-cz);
			new_y = (ks + ij * one_c)*(x-cx) +  (c + jj * one_c)* (y-cy) + (-is + jk * one_c)*(z-cz);
			new_z = (-js + ki * one_c)*(x-cx) + (is + jk * one_c)*(y-cy) + (c + kk * one_c)*  (z-cz);

			a = 2.0*r*S[n]*S[n];
			d2 = SQ(new_x) + SQ(new_y) + SQ(new_z);
			b = 1.0 + SQ(r)*SQ(S[n]) + SQ(S[n])*d2;
			p2 = -QU(r)*QU(S[n]) + 2.0*SQ(r)*SQ(S[n])*(SQ(S[n])*(d2 - 2.0*SQ(new_z)) - 1.0) - SQ(1.0 + SQ(S[n])*d2);
			p1 = (p2 < 0.0) ? sqrt(-p2) : sqrt(p2);
			p3 = p1*p2;

			f1 = (b*new_y) / (new_x*p2*(a*new_x-b)) + (a*(SQ(new_x) + SQ(new_y))*sin(th) - b*new_y) / (new_x*p2*(a*(new_x*cos(th) + new_y*sin(th)) - b));

			if(p2 < 0.0) {
				f2 = 2.0*b*(atan(-a*new_y/p1) + atan((a*new_y - (a*new_x + b)*tan(th/2.0)) / p1)) / p3;
			} else {
				f2 = 2.0*b*(atanh(a*new_y/p1) + atanh(((a*new_x + b)*tan(th/2.0) - a*new_y) / p1)) / p3;
			}			  

			f += f1 + f2;
		}

		var result = f - T;

		return [result, attrs];

	});
};

CSG.unionAll = function() {

	if (arguments.length ==0){
		return undefined;
	}
	var parts = [];
	if (arguments.length == 1 && _.isArray(arguments[0])){
		parts = arguments[0];
	} else {
		parts = arguments;
	}

	var unioned = parts[0]

	for (var i=1; i < parts.length; i++){
		unioned = unioned.union(parts[i])
	}
	return unioned;
};

CSG.intersectAll = function() {

	if (arguments.length ==0){
		return undefined;
	}

	var parts = [];
	if (arguments.length == 1 && _.isArray(arguments[0])){
		parts = arguments[0];
	} else {
		parts = arguments;
	}

	var intersected = parts[0]

	for (var i=1; i < parts.length; i++){
		intersected = unioned.intersect(parts[i])
	}
	return intersected;
};