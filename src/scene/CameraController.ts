import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface FlyToOptions {
  duration?: number;
  minDistance?: number;
  maxDistance?: number;
}

export class CameraController {
  public readonly controls: OrbitControls;
  private readonly camera: THREE.PerspectiveCamera;

  private transitioning = false;
  private transitionElapsed = 0;
  private transitionDuration = 1.0;

  private readonly startPosition = new THREE.Vector3();
  private readonly startTarget = new THREE.Vector3();
  private readonly goalPosition = new THREE.Vector3();
  private readonly goalTarget = new THREE.Vector3();

  private readonly onControlStart = (): void => {
    // Let the user immediately take over without fighting an active camera animation.
    this.transitioning = false;
  };

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 1.1;
    this.controls.panSpeed = 0.75;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.02;
    this.controls.maxDistance = 16000;

    this.controls.addEventListener('start', this.onControlStart);
  }

  public setImmediate(position: THREE.Vector3, target: THREE.Vector3): void {
    this.transitioning = false;
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    this.controls.update();
  }

  public setDistanceLimits(minDistance: number, maxDistance: number): void {
    this.controls.minDistance = Math.max(0.002, minDistance);
    this.controls.maxDistance = Math.max(this.controls.minDistance * 10, maxDistance);
  }

  public flyTo(
    targetPosition: THREE.Vector3,
    cameraPosition: THREE.Vector3,
    options: FlyToOptions = {}
  ): void {
    if (options.minDistance !== undefined || options.maxDistance !== undefined) {
      this.setDistanceLimits(
        options.minDistance ?? this.controls.minDistance,
        options.maxDistance ?? this.controls.maxDistance
      );
    }

    this.startPosition.copy(this.camera.position);
    this.startTarget.copy(this.controls.target);
    this.goalPosition.copy(cameraPosition);
    this.goalTarget.copy(targetPosition);
    this.transitionElapsed = 0;
    this.transitionDuration = Math.max(0.15, options.duration ?? 1.05);
    this.transitioning = true;
  }

  /**
   * Shifts both camera and orbit target by the tracked planet's per-frame orbital
   * movement so the user can freely orbit and zoom around a moving planet.
   */
  public applyTargetDelta(delta: THREE.Vector3): void {
    if (delta.lengthSq() === 0) return;

    this.camera.position.add(delta);
    this.controls.target.add(delta);

    if (this.transitioning) {
      this.startPosition.add(delta);
      this.startTarget.add(delta);
      this.goalPosition.add(delta);
      this.goalTarget.add(delta);
    }
  }

  public cancelTransition(): void {
    this.transitioning = false;
  }

  public isTransitioning(): boolean {
    return this.transitioning;
  }

  public getTarget(): THREE.Vector3 {
    return this.controls.target;
  }

  public update(dt: number): void {
    if (this.transitioning) {
      this.transitionElapsed += dt;
      const rawT = Math.min(1, this.transitionElapsed / this.transitionDuration);
      // Smooth cubic ease-in-out for cinematic yet snappy transitions
      const eased =
        rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

      this.camera.position.lerpVectors(this.startPosition, this.goalPosition, eased);
      this.controls.target.lerpVectors(this.startTarget, this.goalTarget, eased);

      if (rawT >= 1) {
        this.transitioning = false;
      }
    }

    this.controls.update();
  }

  public dispose(): void {
    this.controls.removeEventListener('start', this.onControlStart);
    this.controls.dispose();
  }
}
