/**
 * visor-warp-frag — barrel distortion pass only.
 */
export const visorWarpFragSource = `
#pragma phaserTemplate(shaderName)
precision highp float;

uniform sampler2D uMainSampler;
uniform float uAmplitude;
uniform float uScale;

varying vec2 outTexCoord;

#pragma phaserTemplate(fragmentHeader)

void main() {
    vec2 uv = outTexCoord;
    vec2 centered = uv - 0.5;
    
    // ── Barrel Distortion ──
    float dist2 = dot(centered, centered);
    float factor = dist2 * 2.0;
    vec2 disp = centered * factor;
    vec2 warpedUv = uv + (disp * uAmplitude * uScale);
    
    // Bounds check
    if (warpedUv.x < 0.0 || warpedUv.x > 1.0 || warpedUv.y < 0.0 || warpedUv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    gl_FragColor = texture2D(uMainSampler, warpedUv);
}
`;
