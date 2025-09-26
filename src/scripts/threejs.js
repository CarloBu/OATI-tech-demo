import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { createLenisManager } from './lenis.js';
import { applyMaterials, updateMaterialOpacity } from './materials.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TAARenderPass } from 'three/addons/postprocessing/TAARenderPass.js';
import Stats from 'three/addons/libs/stats.module.js';

const canvas = document.getElementById('threejsCanvas');
const scrollIndicator = document.getElementById('scroll-indicator');
const scene = new THREE.Scene();
const lenisAPI = createLenisManager();

const params = {
	strength: 0.3,
	radius: 0,
	exposure: 3,
	opacity: 0.005,
	taaSampleLevel: 2,
};

let camera = null;
let mixer = null;
let action = null;
let composer = null;
let bloomPass = null;
let taaRenderPass = null;
let gui = null;
let stats = null;

const renderer = new THREE.WebGLRenderer({
	canvas,
	antialias: false, // Disabled since TAA provides temporal antialiasing
	alpha: true,
});

renderer.setClearColor(0x000000);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Initialize Stats for FPS monitoring
stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb
document.body.appendChild(stats.dom);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/');
dracoLoader.setDecoderConfig({ type: 'wasm' });

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

loader.load('/oati.glb', (gltf) => {
	gltf.scene.traverse(applyMaterials);
	scene.add(gltf.scene);

	const ambientLight = new THREE.AmbientLight(0x404040, 0);
	scene.add(ambientLight);

	camera = gltf.cameras.find((cam) => cam.name === 'camera') || gltf.cameras[0];
	if (camera) {
		if (!camera.parent) scene.add(camera);
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
	} else {
		camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
		camera.position.set(0, 0, 5);
		scene.add(camera);
	}

	if (gltf.animations.length > 0) {
		mixer = new THREE.AnimationMixer(gltf.scene);
		action = mixer.clipAction(gltf.animations[0]);
		action.setLoop(THREE.LoopOnce);
		action.clampWhenFinished = true;
		action.play();
		action.paused = true;
	}

	setupPostProcessing();
	setupGUI();
	applyInitialSettings();
});

function setupPostProcessing() {
	if (!camera) return;

	composer = new EffectComposer(renderer);
	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);

	// Add TAA pass for temporal antialiasing
	taaRenderPass = new TAARenderPass(scene, camera);
	taaRenderPass.sampleLevel = params.taaSampleLevel;
	composer.addPass(taaRenderPass);

	bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), params.strength, params.radius, 0);
	composer.addPass(bloomPass);

	const outputPass = new OutputPass();
	composer.addPass(outputPass);
}

function setupGUI() {
	gui = new GUI();

	// Hide the title bar to show just clean sliders
	const guiElement = gui.domElement;
	const titleElement = guiElement.querySelector('.title');
	if (titleElement) {
		titleElement.style.display = 'none';
	}

	// Add all controls directly to the main GUI
	gui
		.add(params, 'strength', 0.0, 3.0)
		.name('bloom strength')
		.onChange((value) => {
			if (bloomPass) bloomPass.strength = value;
		});
	gui
		.add(params, 'radius', 0.0, 1.0)
		.step(0.01)
		.name('bloom radius')
		.onChange((value) => {
			if (bloomPass) bloomPass.radius = value;
		});
	gui
		.add(params, 'opacity', 0.0, 1.0)
		.name('spline opacity')
		.onChange((value) => {
			updateMaterialOpacity(value);
		});
	gui.add(params, 'exposure', 0.1, 5).onChange((value) => {
		renderer.toneMappingExposure = Math.pow(value, 4.0);
	});
	gui
		.add(params, 'taaSampleLevel', 0, 3, 1)
		.name('tta antialiasing')
		.onChange((value) => {
			if (taaRenderPass) {
				taaRenderPass.sampleLevel = value;
			}
		});
}

function applyInitialSettings() {
	updateMaterialOpacity(params.opacity);
	if (bloomPass) {
		bloomPass.strength = params.strength;
		bloomPass.radius = params.radius;
	}
	renderer.toneMappingExposure = Math.pow(params.exposure, 4.0);
}

lenisAPI.onScroll((scroll) => {
	if (!action) return;
	const scrollPercent = scroll / (document.body.scrollHeight - window.innerHeight);
	const progress = Math.max(0, Math.min(1, scrollPercent));

	if (scrollIndicator) {
		scrollIndicator.textContent = `${(progress * 100).toFixed(1)}%`;
	}

	if (action && mixer) {
		action.time = progress * action.getClip().duration;
		mixer.update(0);
	}
});

window.addEventListener('resize', () => {
	const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
	if (isMobile) return;

	if (camera) {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
	}
	renderer.setSize(window.innerWidth, window.innerHeight);
	if (composer) {
		composer.setSize(window.innerWidth, window.innerHeight);
	}
});

const tick = () => {
	stats.begin();

	lenisAPI.update();

	if (camera) {
		if (composer) {
			composer.render();
		} else {
			renderer.render(scene, camera);
		}
	}

	stats.end();
	requestAnimationFrame(tick);
};

tick();

window.lenisManager = lenisAPI;

window.addEventListener('beforeunload', () => {
	lenisAPI.destroy();
	if (gui) gui.destroy();
	if (composer) composer.dispose();
});
