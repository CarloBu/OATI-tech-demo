import Lenis from 'lenis';

let lenis = null;
let scrollCallbacks = [];

export function createLenisManager(options = {}) {
	if (lenis) return getLenisAPI();

	window.scrollTo(0, 0);

	lenis = new Lenis({
		duration: 4,
		easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
		smooth: true,
		smoothTouch: false,
		touchMultiplier: 2,
		direction: 'vertical',
		...options,
	});

	lenis.on('scroll', (e) => {
		scrollCallbacks.forEach((callback) => callback(e.scroll));
	});

	lenis.scrollTo(0, { immediate: true });

	return getLenisAPI();
}

export function getLenisAPI() {
	return {
		onScroll: (callback) => scrollCallbacks.push(callback),
		offScroll: (callback) => {
			const index = scrollCallbacks.indexOf(callback);
			if (index > -1) scrollCallbacks.splice(index, 1);
		},
		get scroll() {
			return lenis?.scroll || 0;
		},
		scrollToPosition: (position) => lenis?.scrollTo(position),
		scrollToTop: () => {
			window.scrollTo(0, 0);
			lenis?.scrollTo(0, { immediate: true });
		},
		update: () => lenis?.raf(Date.now()),
		destroy: () => {
			lenis?.destroy();
			lenis = null;
			scrollCallbacks = [];
		},
	};
}
