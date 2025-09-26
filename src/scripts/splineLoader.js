import * as THREE from 'three';

/**
 * SplineLoader - Loads and animates spline data exported from 3ds Max
 * Supports keyframe animation and smooth interpolation between frames
 */
export class SplineLoader {
	constructor() {
		this.splines = [];
		this.currentTime = 0;
		this.duration = 0;
		this.isPlaying = false;
		this.loop = true;
		this.speed = 1.0;
	}

	/**
	 * Load spline data from JSON file
	 * @param {string} url - Path to the JSON file
	 * @returns {Promise} - Resolves when data is loaded
	 */
	async load(url) {
		try {
			const response = await fetch(url);
			const data = await response.json();
			return this.parseSplineData(data);
		} catch (error) {
			console.error('Error loading spline data:', error);
			throw error;
		}
	}

	/**
	 * Parse loaded spline data and create Three.js objects
	 * @param {Object} data - Parsed JSON data
	 */
	parseSplineData(data) {
		this.metadata = data.metadata || {};
		this.splines = [];

		// Calculate duration from frame data
		let maxFrame = 0;

		data.splines.forEach((splineData) => {
			const spline = {
				name: splineData.name,
				frames: splineData.frames,
				geometry: new THREE.BufferGeometry(),
				material: new THREE.LineBasicMaterial({
					color: 0x00ff00,
					linewidth: 2,
				}),
				mesh: null,
				closed: this.metadata.closed || false,
			};

			// Find maximum frame number
			splineData.frames.forEach((frame) => {
				maxFrame = Math.max(maxFrame, frame.frame);
			});

			// Create initial geometry
			this.updateSplineGeometry(spline, 0);

			// Create line mesh
			spline.mesh = new THREE.Line(spline.geometry, spline.material);
			spline.mesh.name = spline.name;

			this.splines.push(spline);
		});

		// Set duration based on frame rate (assuming 30fps if not specified)
		const frameRate = this.metadata.frameRate || 30;
		this.duration = maxFrame / frameRate;

		return this.splines;
	}

	/**
	 * Update spline geometry for a specific time
	 * @param {Object} spline - Spline object
	 * @param {number} time - Current time in seconds
	 */
	updateSplineGeometry(spline, time) {
		const frameRate = this.metadata.frameRate || 30;
		const targetFrame = time * frameRate;

		// Find surrounding keyframes
		let prevFrame = null;
		let nextFrame = null;

		for (let i = 0; i < spline.frames.length; i++) {
			const frame = spline.frames[i];
			if (frame.frame <= targetFrame) {
				prevFrame = frame;
			}
			if (frame.frame >= targetFrame && !nextFrame) {
				nextFrame = frame;
				break;
			}
		}

		// Handle edge cases
		if (!prevFrame && !nextFrame) {
			return; // No frames available
		}
		if (!nextFrame) {
			nextFrame = prevFrame; // Use last frame
		}
		if (!prevFrame) {
			prevFrame = nextFrame; // Use first frame
		}

		// Check if we have Bezier curve data or simple points
		let interpolatedData;
		if (prevFrame === nextFrame) {
			// No interpolation needed
			interpolatedData = prevFrame.curves || prevFrame.points;
		} else {
			// Interpolate between frames
			const frameDiff = nextFrame.frame - prevFrame.frame;
			const t = frameDiff === 0 ? 0 : (targetFrame - prevFrame.frame) / frameDiff;

			if (prevFrame.curves && nextFrame.curves) {
				// Interpolate Bezier curves
				interpolatedData = this.interpolateBezierCurves(prevFrame.curves, nextFrame.curves, t);
			} else {
				// Fallback to simple point interpolation
				interpolatedData = this.interpolatePoints(prevFrame.points, nextFrame.points, t);
			}
		}

		// Generate geometry from the data
		const positions = [];

		if (interpolatedData && Array.isArray(interpolatedData)) {
			// Handle Bezier curve data
			interpolatedData.forEach((curve) => {
				if (curve.points && Array.isArray(curve.points)) {
					// Generate smooth curve from Bezier points
					const curvePoints = this.generateBezierCurve(curve.points);
					curvePoints.forEach((point) => {
						positions.push(point.x, point.y, point.z);
					});
				}
			});
		} else if (interpolatedData && Array.isArray(interpolatedData)) {
			// Handle simple point data (fallback)
			interpolatedData.forEach((point) => {
				positions.push(point.x, point.y, point.z);
			});
		}

		// Close the curve if specified
		if (spline.closed && positions.length > 0) {
			positions.push(positions[0], positions[1], positions[2]);
		}

		spline.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		spline.geometry.attributes.position.needsUpdate = true;
	}

	/**
	 * Interpolate between two sets of points
	 * @param {Array} points1 - First set of points
	 * @param {Array} points2 - Second set of points
	 * @param {number} t - Interpolation factor (0-1)
	 * @returns {Array} - Interpolated points
	 */
	interpolatePoints(points1, points2, t) {
		const interpolated = [];
		const minLength = Math.min(points1.length, points2.length);

		for (let i = 0; i < minLength; i++) {
			const p1 = points1[i];
			const p2 = points2[i];

			interpolated.push({
				x: THREE.MathUtils.lerp(p1.x, p2.x, t),
				y: THREE.MathUtils.lerp(p1.y, p2.y, t),
				z: THREE.MathUtils.lerp(p1.z, p2.z, t),
			});
		}

		return interpolated;
	}

	/**
	 * Interpolate between two sets of Bezier curves
	 * @param {Array} curves1 - First set of curves
	 * @param {Array} curves2 - Second set of curves
	 * @param {number} t - Interpolation factor (0-1)
	 * @returns {Array} - Interpolated curves
	 */
	interpolateBezierCurves(curves1, curves2, t) {
		const interpolated = [];
		const minLength = Math.min(curves1.length, curves2.length);

		for (let i = 0; i < minLength; i++) {
			const curve1 = curves1[i];
			const curve2 = curves2[i];

			if (curve1.points && curve2.points) {
				const interpolatedPoints = [];
				const minPoints = Math.min(curve1.points.length, curve2.points.length);

				for (let j = 0; j < minPoints; j++) {
					const p1 = curve1.points[j];
					const p2 = curve2.points[j];

					interpolatedPoints.push({
						knot: {
							x: THREE.MathUtils.lerp(p1.knot.x, p2.knot.x, t),
							y: THREE.MathUtils.lerp(p1.knot.y, p2.knot.y, t),
							z: THREE.MathUtils.lerp(p1.knot.z, p2.knot.z, t),
						},
						inHandle: {
							x: THREE.MathUtils.lerp(p1.inHandle.x, p2.inHandle.x, t),
							y: THREE.MathUtils.lerp(p1.inHandle.y, p2.inHandle.y, t),
							z: THREE.MathUtils.lerp(p1.inHandle.z, p2.inHandle.z, t),
						},
						outHandle: {
							x: THREE.MathUtils.lerp(p1.outHandle.x, p2.outHandle.x, t),
							y: THREE.MathUtils.lerp(p1.outHandle.y, p2.outHandle.y, t),
							z: THREE.MathUtils.lerp(p1.outHandle.z, p2.outHandle.z, t),
						},
					});
				}

				interpolated.push({
					splineIndex: curve1.splineIndex || curve2.splineIndex || i + 1,
					points: interpolatedPoints,
				});
			}
		}

		return interpolated;
	}

	/**
	 * Generate smooth curve points from Bezier control points
	 * @param {Array} bezierPoints - Array of Bezier control points
	 * @param {number} segments - Number of segments to generate (default: 20)
	 * @returns {Array} - Array of curve points
	 */
	generateBezierCurve(bezierPoints, segments = 20) {
		if (!bezierPoints || bezierPoints.length < 2) {
			return [];
		}

		const curvePoints = [];

		// For each pair of consecutive points, create a cubic Bezier curve
		for (let i = 0; i < bezierPoints.length - 1; i++) {
			const current = bezierPoints[i];
			const next = bezierPoints[i + 1];

			// Create cubic Bezier curve
			const curve = new THREE.CubicBezierCurve3(
				new THREE.Vector3(current.knot.x, current.knot.y, current.knot.z),
				new THREE.Vector3(current.outHandle.x, current.outHandle.y, current.outHandle.z),
				new THREE.Vector3(next.inHandle.x, next.inHandle.y, next.inHandle.z),
				new THREE.Vector3(next.knot.x, next.knot.y, next.knot.z),
			);

			// Generate points along the curve
			const points = curve.getPoints(segments);
			curvePoints.push(...points);
		}

		// If we only have one point, just return the knot position
		if (bezierPoints.length === 1) {
			const point = bezierPoints[0];
			curvePoints.push(new THREE.Vector3(point.knot.x, point.knot.y, point.knot.z));
		}

		return curvePoints;
	}

	/**
	 * Add all spline meshes to a Three.js scene
	 * @param {THREE.Scene} scene - Target scene
	 */
	addToScene(scene) {
		this.splines.forEach((spline) => {
			if (spline.mesh) {
				scene.add(spline.mesh);
			}
		});
	}

	/**
	 * Remove all spline meshes from a Three.js scene
	 * @param {THREE.Scene} scene - Target scene
	 */
	removeFromScene(scene) {
		this.splines.forEach((spline) => {
			if (spline.mesh) {
				scene.remove(spline.mesh);
			}
		});
	}

	/**
	 * Update animation
	 * @param {number} deltaTime - Time elapsed since last update
	 */
	update(deltaTime) {
		if (!this.isPlaying || this.duration === 0) return;

		this.currentTime += deltaTime * this.speed;

		if (this.loop) {
			this.currentTime = this.currentTime % this.duration;
		} else {
			this.currentTime = Math.min(this.currentTime, this.duration);
			if (this.currentTime >= this.duration) {
				this.isPlaying = false;
			}
		}

		this.updateSplines();
	}

	/**
	 * Update all splines for current time
	 */
	updateSplines() {
		this.splines.forEach((spline) => {
			this.updateSplineGeometry(spline, this.currentTime);
		});
	}

	/**
	 * Set animation time manually (for scrubbing)
	 * @param {number} time - Time in seconds
	 */
	setTime(time) {
		this.currentTime = Math.max(0, Math.min(time, this.duration));
		this.updateSplines();
	}

	/**
	 * Set animation progress (0-1)
	 * @param {number} progress - Progress value between 0 and 1
	 */
	setProgress(progress) {
		const clampedProgress = Math.max(0, Math.min(1, progress));
		this.setTime(clampedProgress * this.duration);
	}

	/**
	 * Play animation
	 */
	play() {
		this.isPlaying = true;
	}

	/**
	 * Pause animation
	 */
	pause() {
		this.isPlaying = false;
	}

	/**
	 * Stop animation and reset to beginning
	 */
	stop() {
		this.isPlaying = false;
		this.currentTime = 0;
		this.updateSplines();
	}

	/**
	 * Get a specific spline by name
	 * @param {string} name - Spline name
	 * @returns {Object|null} - Spline object or null if not found
	 */
	getSplineByName(name) {
		return this.splines.find((spline) => spline.name === name) || null;
	}

	/**
	 * Set material for a specific spline
	 * @param {string} name - Spline name
	 * @param {THREE.Material} material - New material
	 */
	setSplineMaterial(name, material) {
		const spline = this.getSplineByName(name);
		if (spline && spline.mesh) {
			spline.mesh.material = material;
		}
	}

	/**
	 * Set material for all splines
	 * @param {THREE.Material} material - New material
	 */
	setAllSplinesMaterial(material) {
		this.splines.forEach((spline) => {
			if (spline.mesh) {
				spline.mesh.material = material;
			}
		});
	}

	/**
	 * Set visibility for a specific spline
	 * @param {string} name - Spline name
	 * @param {boolean} visible - Visibility state
	 */
	setSplineVisibility(name, visible) {
		const spline = this.getSplineByName(name);
		if (spline && spline.mesh) {
			spline.mesh.visible = visible;
		}
	}

	/**
	 * Dispose of all resources
	 */
	dispose() {
		this.splines.forEach((spline) => {
			if (spline.geometry) {
				spline.geometry.dispose();
			}
			if (spline.material) {
				spline.material.dispose();
			}
		});
		this.splines = [];
	}

	/**
	 * Get current animation progress (0-1)
	 * @returns {number} - Current progress
	 */
	getProgress() {
		return this.duration > 0 ? this.currentTime / this.duration : 0;
	}

	/**
	 * Get animation duration in seconds
	 * @returns {number} - Duration in seconds
	 */
	getDuration() {
		return this.duration;
	}

	/**
	 * Get current time in seconds
	 * @returns {number} - Current time
	 */
	getCurrentTime() {
		return this.currentTime;
	}
}
