import {
  Component,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentType,
  type ErrorInfo,
  type ReactNode
} from "react";
import {
  Link,
  Navigate,
  useLocation,
  useRoutes,
  type RouteObject
} from "react-router-dom";
import {
  registeredRouteEntries,
  projectIdFromRegisteredPath,
  routePath,
  type AppRouteId,
  type AppScreenId
} from "./route-registry.js";
import { shouldMoveFocusToRouteHeading } from "./route-focus-policy.js";

export type RegisteredScreens = Readonly<Record<AppScreenId, ComponentType>>;

export function RegisteredRouteOutlet({ screens }: { screens: RegisteredScreens }) {
  const routes = useMemo(() => createRegisteredRouteObjects(screens), [screens]);
  return useRoutes(routes);
}

export function MalformedRouteScreen() {
  return (
    <RouteRecoveryLayout title="This link is not valid">
      <p>The address contains a malformed or unsupported project value. No project was opened.</p>
      <RecoveryLinks />
    </RouteRecoveryLayout>
  );
}

export function MissingProjectRouteScreen() {
  return (
    <RouteRecoveryLayout title="Project not found">
      <p>The project in this link is not available. It may have been renamed, moved, or removed.</p>
      <RecoveryLinks />
    </RouteRecoveryLayout>
  );
}

export function createRegisteredRouteObjects(screens: RegisteredScreens): RouteObject[] {
  const routes: RouteObject[] = [];

  for (const route of registeredRouteEntries()) {
    if (route.kind === "screen") {
      const Screen = screens[route.screen as AppScreenId];
      const element = (
        <RouteScreenFrame routeId={route.id as AppRouteId} title={route.title}>
          <Screen />
        </RouteScreenFrame>
      );
      routes.push({ path: route.path, element });
      if (route.legacyPath) routes.push({ path: route.legacyPath, element });
      continue;
    }

    if (route.kind === "redirect") {
      routes.push({
        path: route.path,
        element: <RegisteredRedirect target={route.target as AppRouteId} preserveProject={route.preserveProject} />
      });
      continue;
    }

    routes.push({ path: route.path, element: <RouteNotFoundScreen /> });
  }

  return routes;
}

function RegisteredRedirect({ target, preserveProject }: { target: AppRouteId; preserveProject: boolean }) {
  const location = useLocation();
  const projectId = preserveProject ? projectIdFromRegisteredPath(location.pathname) : undefined;
  return <Navigate to={routePath(target, { projectId })} replace />;
}

function RouteScreenFrame({
  routeId,
  title,
  children
}: {
  routeId: AppRouteId;
  title: string;
  children: ReactNode;
}) {
  const location = useLocation();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const previousPathnameRef = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    document.title = `${title} - Zharwing Memory`;
    const shouldMoveFocus = shouldMoveFocusToRouteHeading(
      previousPathnameRef.current,
      location.pathname
    );
    previousPathnameRef.current = location.pathname;
    if (!shouldMoveFocus) return;
    if (typeof requestAnimationFrame !== "function") {
      headingRef.current?.focus({ preventScroll: true });
      return;
    }
    const frame = requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, routeId, title]);

  return (
    <section className="route-screen-frame" aria-labelledby={`route-heading-${routeId}`}>
      <h1
        className="sr-only"
        data-route-heading="true"
        id={`route-heading-${routeId}`}
        ref={headingRef}
        tabIndex={-1}
      >
        {title}
      </h1>
      <RouteErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<RoutePending title={title} />}>
          {children}
        </Suspense>
      </RouteErrorBoundary>
    </section>
  );
}

function RoutePending({ title }: { title: string }) {
  return (
    <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
      Loading {title.toLocaleLowerCase("en-US")}...
    </div>
  );
}

function RouteNotFoundScreen() {
  return (
    <RouteRecoveryLayout title="Page not found">
      <p>The requested page is not registered in this version of Zharwing Memory.</p>
      <RecoveryLinks />
    </RouteRecoveryLayout>
  );
}

function RouteRecoveryLayout({ title, children }: { title: string; children: ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useLayoutEffect(() => {
    document.title = `${title} - Zharwing Memory`;
    headingRef.current?.focus({ preventScroll: true });
  }, [title]);

  return (
    <section className="screen route-recovery" aria-labelledby="route-recovery-heading">
      <div className="panel empty">
        <h1 id="route-recovery-heading" ref={headingRef} tabIndex={-1}>{title}</h1>
        {children}
      </div>
    </section>
  );
}

function RecoveryLinks() {
  return (
    <div className="button-row">
      <Link className="button-link primary" to={routePath("projects")}>Choose a project</Link>
      <Link className="button-link" to={routePath("dashboard")}>Open the dashboard</Link>
    </div>
  );
}

interface RouteErrorBoundaryProps {
  resetKey: string;
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  failed: boolean;
  resetKey: string;
}

class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<RouteErrorBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: RouteErrorBoundaryProps,
    state: RouteErrorBoundaryState
  ): Partial<RouteErrorBoundaryState> | null {
    return props.resetKey === state.resetKey
      ? null
      : { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo): void {
    // The local diagnostics boundary records a sanitized category separately.
    // Never render or print an external error or component stack here.
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <RouteRecoveryLayout title="This page could not be displayed">
        <p>Your project data was not changed. Retry this page, or return to project selection.</p>
        <div className="button-row">
          <button type="button" className="primary" onClick={() => this.setState({ failed: false })}>
            Retry page
          </button>
          <Link className="button-link" to={routePath("projects")}>Choose a project</Link>
        </div>
      </RouteRecoveryLayout>
    );
  }
}
