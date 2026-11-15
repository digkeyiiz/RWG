// Cinematic color grade (runs after tone-mapping): filmic contrast, time-of-day tint, vignette, film grain.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    night: { value: 0 },
    wet: { value: 0 },
    speed: { value: 0 },
    tint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float night; uniform float wet; uniform float speed; uniform vec3 tint;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      // speed-based radial chromatic aberration (subtle)
      float ca = 0.0007 + speed * 0.0022;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ca).b;
      // filmic S-curve contrast
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.35);
      // saturation: slightly richer by day, desaturated in rain
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float sat = 1.08 - wet * 0.18 - night * 0.05;
      col = mix(vec3(l), col, sat);
      // teal shadows / warm highlights (cinematic split tone), stronger at night
      col += vec3(-0.012, 0.004, 0.02) * (1.0 - l) * (0.6 + night);
      col *= tint;
      // vignette (stronger with speed)
      float vig = smoothstep(0.85, 0.15, r2 * (1.6 + speed * 0.8));
      col *= mix(0.72, 1.0, vig);
      // film grain
      float g = hash(vUv * vec2(1920.0, 1080.0) + fract(time) * 100.0) - 0.5;
      col += g * (0.022 + night * 0.012);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function makeGradePass() {
  const pass = new ShaderPass(GradeShader);
  pass.setState = ({ time, night, wet, speed }) => {
    const u = pass.uniforms;
    u.time.value = time; u.night.value = night; u.wet.value = wet; u.speed.value = Math.min(1, Math.max(0, speed));
    // warm tint by day, cool tint at night
    u.tint.value.set(1.02 - night * 0.08, 1.0 - night * 0.02, 0.98 + night * 0.1);
  };
  return pass;
}
