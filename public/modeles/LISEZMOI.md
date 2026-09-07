# u2netp.onnx

**U²-Net-p**, la version légère (4,4 Mo) de [U²-Net](https://github.com/xuebinqin/U-2-Net),
réseau de détection d'objet saillant de Qin et al., publié sous licence **Apache 2.0**.

Entrée `1×3×320×320`, normalisation d'ImageNet (moyenne `0.485 0.456 0.406`, écart-type
`0.229 0.224 0.225`). Le modèle sort sept cartes ; l'application n'utilise que la première, la
plus fine, qu'elle étale entre 0 et 255 pour en faire le canal alpha de la photo.

Il tourne dans le navigateur, sur l'appareil : les photos ne sont envoyées nulle part.
