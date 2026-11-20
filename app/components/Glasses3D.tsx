
import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function Glasses3D() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();

    // An orthographic camera keeps the model's proportions stable as the
    // captured-photo card changes size.
    const camera = new THREE.OrthographicCamera(-2.15, 2.15, 0.9, -0.9, 0.1, 100);
    camera.position.z = 8;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));

    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(0, 3, 5);
    scene.add(light);

    const glasses = new THREE.Group();
    scene.add(glasses);

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x171717,
      metalness: 0.65,
      roughness: 0.28,
    });

    const lensMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.09,
      roughness: 0.1,
      metalness: 0,
      transmission: 0.2,
      side: THREE.DoubleSide,
    });

    const createLens = (x: number) => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.65, 0.38);
      shape.quadraticCurveTo(0, 0.48, 0.65, 0.38);
      shape.quadraticCurveTo(0.72, 0.3, 0.62, -0.28);
      shape.quadraticCurveTo(0, -0.58, -0.62, -0.28);
      shape.quadraticCurveTo(-0.72, 0.1, -0.65, 0.38);

      const points = shape.getPoints(48).map(
        (point) => new THREE.Vector3(point.x, point.y, 0)
      );

      const curve = new THREE.CatmullRomCurve3(points, true);
      const rim = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 100, 0.035, 8, true),
        frameMaterial
      );

      rim.position.x = x;
      glasses.add(rim);

      const lens = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        lensMaterial
      );

      lens.position.set(x, 0, -0.015);
      glasses.add(lens);
    };

    createLens(-0.72);
    createLens(0.72);

    const bridgeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.08, 0.22, 0),
      new THREE.Vector3(0, 0.3, 0.05),
      new THREE.Vector3(0.08, 0.22, 0),
    ]);

    glasses.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(bridgeCurve, 24, 0.04, 8, false),
        frameMaterial
      )
    );

    const addTemple = (side: number) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 1.37, 0.2, 0),
        new THREE.Vector3(side * 1.65, 0.12, -0.1),
        new THREE.Vector3(side * 1.9, -0.05, -0.45),
      ]);

      glasses.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 32, 0.045, 8, false),
          frameMaterial
        )
      );
    };

    addTemple(-1);
    addTemple(1);

    const render = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;

      renderer.setSize(w, h);
      const aspect = w / h;
      const viewHeight = 1.8;
      camera.left = -(viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };

    const observer = new ResizeObserver(render);

    observer.observe(mount);

    render();

    return () => {
      observer.disconnect();
      renderer.dispose();

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();

          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];

          materials.forEach((material) => material.dispose());
        }
      });

      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="pointer-events-none absolute inset-0 z-10"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
