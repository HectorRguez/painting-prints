// Seeded architectural composition using Michael Fogleman's unchanged ln
// visibility engine. MIT; see upstream/LICENSE.md.
package main

import (
    "encoding/json"
    "math"
    "math/rand"
    "syscall/js"
    "painting/ln"
)

type tower struct { *ln.Cube; stripes int }
func (t tower) Paths() ln.Paths {
    paths := t.Cube.Paths()
    a, b := t.Min, t.Max
    for i := 1; i < t.stripes; i++ {
        s := float64(i) / float64(t.stripes)
        x, y := a.X + (b.X-a.X)*s, a.Y + (b.Y-a.Y)*s
        paths = append(paths, ln.Path{{x,a.Y,a.Z},{x,a.Y,b.Z}}, ln.Path{{b.X,y,a.Z},{b.X,y,b.Z}})
    }
    for z := a.Z + 0.22; z < b.Z; z += 0.22 {
        paths = append(paths, ln.Path{{a.X,a.Y,z},{b.X,a.Y,z},{b.X,b.Y,z}})
    }
    return paths
}
func generate(_ js.Value, args []js.Value) interface{} {
    rng := rand.New(rand.NewSource(int64(args[0].Float())))
    scene := ln.Scene{}
    for x := -4; x <= 4; x++ {
        for y := -4; y <= 4; y++ {
            if rng.Float64() < 0.12 { continue }
            px, py := float64(x)*1.15, float64(y)*1.15
            r := 0.28 + rng.Float64()*0.14
            height := 0.5 + rng.Float64()*1.9 + math.Max(0, 2.0-math.Hypot(px,py)*0.45)*rng.Float64()*2.4
            scene.Add(tower{ln.NewCube(ln.Vector{px-r,py-r,0},ln.Vector{px+r,py+r,height}), 3+int(rng.Int31n(4))})
        }
    }
    eye := ln.Vector{14, -19, 16}
    center := ln.Vector{0, 0, 1.3}
    paths := scene.Render(eye, center, ln.Vector{0,0,1}, 1414, 1000, 34, 0.1, 100, 0.035).Simplify(0.3)
    coordinates := make([][][2]float64, 0, len(paths))
    for _, path := range paths {
        line := make([][2]float64, len(path))
        for i,p := range path { line[i] = [2]float64{p.X, 1000-p.Y} }
        coordinates = append(coordinates,line)
    }
    encoded, err := json.Marshal(coordinates)
    if err != nil { return "[]" }
    return string(encoded)
}
func main() {
    js.Global().Set("renderCityscape", js.FuncOf(generate))
    select {}
}
