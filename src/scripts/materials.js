import * as THREE from 'three';

// Define the color palette for glowing materials
const glowColors = [
	'#B5121B', // Dark Red
	'#D7382E', // Red
	'#FA5D0F', // Orange
	'#FBA144', // Light Orange
	'#D7382E', // Red
	'#FA5D0F', // Orange
	'#FBA144', // Light Orange

	'#144ED5', // Blue
	'#FF80FF', // Pink/Magenta
];

// Create glowing materials with transparency and emission
const glowingMaterials = glowColors.map((color) => {
	return new THREE.MeshStandardMaterial({
		color: color,
		emissive: color,
		emissiveIntensity: 2.0, // Higher intensity for better bloom
		transparent: true,
		opacity: 0.8,
		roughness: 0.1,
		metalness: 0.2,
		side: THREE.DoubleSide,
		toneMapped: false, // Critical for bloom effect
	});
});

// Store materials globally for bloom parameter updates
export const materialInstances = [];

// Function to get a random glowing material
function getRandomGlowingMaterial() {
	const randomIndex = Math.floor(Math.random() * glowingMaterials.length);
	return glowingMaterials[randomIndex];
}

export const defaultMaterial = new THREE.MeshStandardMaterial({
	color: 0x000000,
	roughness: 0.2,
	metalness: 0.8,
});

export function applyMaterials(child) {
	if (!child.isMesh) return;
	// Assign a random glowing material to each mesh
	const material = getRandomGlowingMaterial();
	child.material = material;

	// Store material instance for bloom parameter updates
	materialInstances.push(material);
}

// Function to update material glow based on bloom parameters
// This is now mainly for fallback purposes since bloom is handled by post-processing
export function updateMaterialGlow(threshold, strength, radius) {
	materialInstances.forEach((material) => {
		// Keep base emissive intensity high for bloom effect
		material.emissiveIntensity = Math.max(2.0, strength * 2.0);
		material.needsUpdate = true;
	});
}

// Function to update material opacity
export function updateMaterialOpacity(opacity) {
	materialInstances.forEach((material) => {
		material.opacity = opacity;
		material.needsUpdate = true;
	});
}
