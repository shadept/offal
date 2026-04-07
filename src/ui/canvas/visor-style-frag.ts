/**
 * visor-style-frag — screen-space visor styling applied after the barrel pass.
 */
export const visorStyleFragSource = `
#pragma phaserTemplate(shaderName)
precision highp float;

uniform sampler2D uMainSampler;
uniform float uVignette;
uniform float uScanlines;
uniform float uChroma;
uniform float uViewportScale;
uniform float uTime;

varying vec2 outTexCoord;

#pragma phaserTemplate(fragmentHeader)

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = outTexCoord;
    vec2 centered = uv - 0.5;
    float screenEffectScale = mix(0.35, 1.0, uViewportScale);

    vec2 chromaDir = normalize(centered + vec2(0.0001, 0.0001));
    vec2 chromaOffset = chromaDir * (0.0015 * uChroma * screenEffectScale);

    vec4 base = texture2D(uMainSampler, uv);
    vec4 redSample = texture2D(uMainSampler, clamp(uv + chromaOffset, 0.0, 1.0));
    vec4 blueSample = texture2D(uMainSampler, clamp(uv - chromaOffset, 0.0, 1.0));
    vec4 color = vec4(redSample.r, base.g, blueSample.b, base.a);

    if (uScanlines > 0.0) {
        float scanlineFrequency = mix(520.0, 1200.0, uViewportScale);
        float scanlineStrength = 0.028 * uScanlines * screenEffectScale;
        float scanline = sin((uv.y * scanlineFrequency) + (uTime * 4.0)) * scanlineStrength;
        color.rgb -= scanline;
    }

    float grain = (hash(uv + uTime) - 0.5) * 0.02 * screenEffectScale;
    color.rgb += grain;

    float dist = length(centered);
    if (uVignette > 0.0) {
        float v = smoothstep(0.4, 0.88, dist);
        color.rgb = mix(color.rgb, vec3(0.0), v * 0.32 * uVignette);

        float edge = smoothstep(0.5, 0.94, dist);
        color.rgb = mix(color.rgb, color.rgb * vec3(0.92, 1.0, 0.96), edge * 0.08 * uVignette);
    }

    color.rgb *= vec3(0.97, 1.0, 0.985);
    gl_FragColor = color;
}
`;
