import { Link } from "react-router";

export function RouteLoading() {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      Loading…
    </p>
  );
}

export function ErrorMessage({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="py-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      <Link to="/" className="mt-4 inline-block text-sm underline">
        Return home
      </Link>
    </div>
  );
}

export function NotFound() {
  return (
    <ErrorMessage
      title="Page not found"
      detail="The page you requested does not exist."
    />
  );
}
