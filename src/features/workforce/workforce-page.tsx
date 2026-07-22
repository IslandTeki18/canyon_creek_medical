import { Link } from "react-router";

export default function WorkforcePage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">Workforce</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Clinical and front-desk workspace.
      </p>
      <ul className="mt-4 list-disc pl-5 text-sm">
        <li>
          <Link to="/app/patients" className="underline">
            Patient registry
          </Link>
        </li>
      </ul>
    </section>
  );
}
