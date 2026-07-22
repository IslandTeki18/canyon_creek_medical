import { Link } from "react-router";

export default function AdminPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">Administration</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Practice configuration and user management.
      </p>
      <ul className="mt-4 list-disc pl-5 text-sm">
        <li>
          <Link to="/admin/users" className="underline">
            Workforce users
          </Link>
        </li>
      </ul>
    </section>
  );
}
