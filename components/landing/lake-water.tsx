"use client"

import * as React from "react"

/**
 * The water inside the lake outline.
 *
 * This replaces an earlier CSS approach where three gradient bands slid across
 * the shape. That read exactly as what it was: solid bars crossing left to
 * right. What water actually does is fold into itself, so this is a fragment
 * shader doing domain-warped fractal noise: noise is sampled, the result is
 * used to displace the coordinates of the next sample, twice over, and the
 * final field picks between four colours. Each warp layer drifts on its own
 * vector at its own rate, so the colour melts in several directions at once
 * instead of travelling one way.
 *
 * Clipping is done in CSS with a mask rather than inside the canvas, because
 * the lake silhouette already exists as an SVG and a mask keeps the shader
 * ignorant of the shape. `mask-size: cover` matches the sibling SVG's
 * `preserveAspectRatio="xMidYMid slice"`, which is what keeps the water
 * registered to its shoreline at every viewport size.
 *
 * Degrades in three steps: no WebGL, or reduced motion, or a hidden tab, and
 * the CSS gradient underneath is what shows. Nothing here is load-bearing for
 * legibility or content.
 */

const VERT = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;
varying vec2 vUv;

uniform vec2  u_res;
uniform float u_time;
uniform int   u_octaves;
uniform vec3  u_deep;
uniform vec3  u_mid;
uniform vec3  u_bright;
uniform vec3  u_glint;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Fractal noise. Octave count is a uniform so phones can run cheaper.
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= u_octaves) break;
    sum += amp * snoise(p);
    p = p * 2.02;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0) * 1.55;
  float t = u_time;

  // Two rounds of domain warping. Each layer drifts on its own vector, which
  // is what makes the colour arrive from several directions at once.
  vec2 q = vec2(
    fbm(p + vec2( 0.13 * t,  0.09 * t)),
    fbm(p + vec2(-0.11 * t,  0.16 * t) + 3.7)
  );

  vec2 r = vec2(
    fbm(p + 2.6 * q + vec2( 0.07 * t, -0.14 * t) + 1.3),
    fbm(p + 2.6 * q + vec2(-0.17 * t, -0.06 * t) + 8.1)
  );

  float f = fbm(p + 3.1 * r);

  // Melt between four water tones on the warped field rather than on a
  // straight gradient, so the boundaries curl instead of sweeping.
  vec3 col = u_deep;
  col = mix(col, u_mid,    smoothstep(-0.65, 0.40, f));
  col = mix(col, u_bright, smoothstep(-0.05, 0.72, length(q) * 0.95));
  col = mix(col, u_glint,  smoothstep(0.30, 0.95, r.x * 0.8 + f * 0.6) * 0.85);

  // A slow swell so the whole surface breathes rather than only churning.
  col *= 0.92 + 0.12 * sin(t * 0.35 + f * 2.0);

  gl_FragColor = vec4(col, 1.0);
}
`

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

export function LakeWater() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const gl =
      canvas.getContext("webgl", { antialias: false, alpha: false, depth: false }) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null)
    if (!gl) return

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)
      if (!s) return null
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        // A driver that rejects the shader falls back to the CSS gradient.
        console.error("[lake] shader:", gl.getShaderInfoLog(s))
        return null
      }
      return s
    }

    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, "position")
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const u = {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      octaves: gl.getUniformLocation(program, "u_octaves"),
      deep: gl.getUniformLocation(program, "u_deep"),
      mid: gl.getUniformLocation(program, "u_mid"),
      bright: gl.getUniformLocation(program, "u_bright"),
      glint: gl.getUniformLocation(program, "u_glint"),
    }

    gl.uniform3fv(u.deep, rgb("#07463a"))
    gl.uniform3fv(u.mid, rgb("#12876c"))
    gl.uniform3fv(u.bright, rgb("#31c79c"))
    gl.uniform3fv(u.glint, rgb("#adf7dd"))

    // A full-screen fragment shader is fill-rate bound, so the pixel budget is
    // where it gets paid for. Phones render fewer pixels and fewer octaves.
    const small = window.innerWidth < 900
    gl.uniform1i(u.octaves, small ? 3 : 4)
    const maxDpr = small ? 1.2 : 1.6

    let raf = 0
    let running = true

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
      gl.uniform2f(u.res, canvas.width, canvas.height)
    }

    const draw = (tMs: number) => {
      resize()
      gl.uniform1f(u.time, tMs * 0.001)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    if (reduced) {
      // One frame, held. The composition is finished, it simply does not move.
      draw(0)
    } else {
      const loop = (t: number) => {
        if (!running) return
        draw(t)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }

    const onVisibility = () => {
      if (reduced) return
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        raf = requestAnimationFrame(function loop(t: number) {
          if (!running) return
          draw(t)
          raf = requestAnimationFrame(loop)
        })
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    const ro = new ResizeObserver(() => {
      if (reduced) draw(0)
    })
    ro.observe(canvas)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener("visibilitychange", onVisibility)
      ro.disconnect()
      gl.getExtension("WEBGL_lose_context")?.loseContext()
    }
  }, [])

  return <canvas ref={canvasRef} className="ozk-water" aria-hidden />
}
