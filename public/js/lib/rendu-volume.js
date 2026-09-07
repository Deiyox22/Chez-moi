/**
 * Le rasteriseur du moteur : des quadrilatères texturés, en perspective juste.
 *
 * Un meuble détouré n'est pas un rectangle une fois posé dans la pièce : ses
 * arêtes verticales convergent, comme tout le reste de la photo. Le dessiner
 * revient donc à plaquer une image dans un quadrilatère quelconque, ce que le
 * canvas 2D ne sait pas faire — il n'interpole qu'affinement, et l'image se
 * plie en deux triangles visibles.
 *
 * WebGL le fait exactement, à condition de lui donner la bonne quatrième
 * coordonnée : en écrivant gl_Position avec le w de la projection, la carte
 * graphique rétablit d'elle-même l'interpolation perspective des coordonnées de
 * texture. Le moteur tient alors en un shader de six lignes.
 */

const SOMMET = `
attribute vec2 a_ecran;   // position déjà projetée, en pixels de la toile
attribute float a_w;      // profondeur : c'est elle qui redresse la texture
attribute vec2 a_uv;
uniform vec2 u_taille;
varying vec2 v_uv;
void main() {
  vec2 ndc = vec2(a_ecran.x / u_taille.x * 2.0 - 1.0, 1.0 - a_ecran.y / u_taille.y * 2.0);
  gl_Position = vec4(ndc * a_w, 0.0, a_w);
  v_uv = a_uv;
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec4 u_teinte;    // rgb = couleur imposée, a = opacité ; a<0 : texture telle quelle
varying vec2 v_uv;
void main() {
  vec4 c = texture2D(u_texture, v_uv);
  if (c.a < 0.004) discard;
  gl_FragColor = u_teinte.a < 0.0 ? c : vec4(u_teinte.rgb, c.a * u_teinte.a);
}`;

function compiler(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader : ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

export class RenduVolume {
  /** @returns {RenduVolume|null} null si la machine n'a pas de WebGL. */
  static creer(canvas) {
    const gl =
      canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: true }) ||
      canvas.getContext('experimental-webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    return gl ? new RenduVolume(canvas, gl) : null;
  }

  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    this.textures = new WeakMap();

    const programme = gl.createProgram();
    gl.attachShader(programme, compiler(gl, gl.VERTEX_SHADER, SOMMET));
    gl.attachShader(programme, compiler(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(programme);
    if (!gl.getProgramParameter(programme, gl.LINK_STATUS)) {
      throw new Error(`programme : ${gl.getProgramInfoLog(programme)}`);
    }
    gl.useProgram(programme);
    this.programme = programme;

    this.aEcran = gl.getAttribLocation(programme, 'a_ecran');
    this.aW = gl.getAttribLocation(programme, 'a_w');
    this.aUv = gl.getAttribLocation(programme, 'a_uv');
    this.uTaille = gl.getUniformLocation(programme, 'u_taille');
    this.uTeinte = gl.getUniformLocation(programme, 'u_teinte');

    this.tampon = gl.createBuffer();
    // Deux triangles, six sommets de cinq nombres : écran(2), w(1), uv(2).
    this.donnees = new Float32Array(6 * 5);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST); // l'ordre est donné par le tri en profondeur
  }

  dimensionner(largeur, hauteur) {
    if (this.canvas.width !== largeur || this.canvas.height !== hauteur) {
      this.canvas.width = largeur;
      this.canvas.height = hauteur;
    }
    this.gl.viewport(0, 0, largeur, hauteur);
    this.gl.uniform2f(this.uTaille, largeur, hauteur);
  }

  /** Les textures sont gardées par source ; une source modifiée demande `oublier`. */
  #texture(source) {
    const { gl } = this;
    let texture = this.textures.get(source);
    if (texture) return texture;
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.textures.set(source, texture);
    return texture;
  }

  oublier(source) {
    const texture = this.textures.get(source);
    if (texture) {
      this.gl.deleteTexture(texture);
      this.textures.delete(source);
    }
  }

  effacer() {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  /**
   * Plaque une image dans un quadrilatère.
   * @param {*} source image, canvas ou bitmap
   * @param {{x:number,y:number,largeur:number,hauteur:number}} cadre sous-rectangle utile de la source
   * @param {Array<{x:number,y:number,w:number}>} sommets haut-gauche, haut-droit, bas-droit, bas-gauche
   * @param {number[]|null} teinte [r,g,b,a] en 0..1 pour imposer une couleur (les ombres), sinon null
   */
  quad(source, cadre, sommets, teinte = null) {
    const { gl } = this;
    if (sommets.some((s) => !s || !Number.isFinite(s.x) || !Number.isFinite(s.y) || s.w <= 0)) return;

    const u0 = cadre.x / source.width;
    const v0 = cadre.y / source.height;
    const u1 = (cadre.x + cadre.largeur) / source.width;
    const v1 = (cadre.y + cadre.hauteur) / source.height;
    const uv = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];

    const d = this.donnees;
    [0, 1, 2, 0, 2, 3].forEach((coin, rang) => {
      const s = sommets[coin];
      d[rang * 5] = s.x;
      d[rang * 5 + 1] = s.y;
      d[rang * 5 + 2] = s.w;
      d[rang * 5 + 3] = uv[coin][0];
      d[rang * 5 + 4] = uv[coin][1];
    });

    gl.bindBuffer(gl.ARRAY_BUFFER, this.tampon);
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
    const pas = 5 * 4;
    gl.enableVertexAttribArray(this.aEcran);
    gl.vertexAttribPointer(this.aEcran, 2, gl.FLOAT, false, pas, 0);
    gl.enableVertexAttribArray(this.aW);
    gl.vertexAttribPointer(this.aW, 1, gl.FLOAT, false, pas, 8);
    gl.enableVertexAttribArray(this.aUv);
    gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, pas, 12);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#texture(source));
    gl.uniform4fv(this.uTeinte, teinte || [0, 0, 0, -1]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /** Un rectangle plein écran, sans perspective : la photo de fond. */
  fond(source) {
    const { width, height } = this.canvas;
    this.quad(
      source,
      { x: 0, y: 0, largeur: source.width, hauteur: source.height },
      [
        { x: 0, y: 0, w: 1 },
        { x: width, y: 0, w: 1 },
        { x: width, y: height, w: 1 },
        { x: 0, y: height, w: 1 },
      ]
    );
  }
}
