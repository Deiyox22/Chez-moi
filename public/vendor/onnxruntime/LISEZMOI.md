# ONNX Runtime Web — copie locale

Fichiers repris tels quels de [`onnxruntime-web`](https://www.npmjs.com/package/onnxruntime-web)
**1.29.0**, publié par Microsoft sous licence **MIT**.

- `ort.wasm.bundle.min.mjs` — la variante « wasm » (sans JSEP/WebGPU), qui suffit ici
- `ort-wasm-simd-threaded.mjs` et `.wasm` — le binaire WebAssembly qu'elle charge

Servis depuis ce domaine plutôt que depuis un CDN : le détourage doit marcher hors ligne, et
l'application ne dépend d'aucun tiers pour fonctionner.
