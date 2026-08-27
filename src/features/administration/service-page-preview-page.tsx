import { useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { NotFound } from "../../components/app-shell";
import { ServiceDetailView } from "../public/service-detail-page";
import { MarketingPage, WRAP } from "../public/marketing-chrome";
import { toServicePreview } from "./preview-payload";

export default function ServicePagePreviewPage() {
  const { servicePageId } = useParams();
  const page = useQuery(
    api.domains.content.getServicePage,
    servicePageId
      ? { servicePageId: servicePageId as Id<"servicePages"> }
      : "skip",
  );
  if (!servicePageId || page === null) return <NotFound />;
  if (page === undefined) {
    return (
      <MarketingPage>
        <p role="status" className={`${WRAP} py-16 text-ink/70`}>
          Loading preview…
        </p>
      </MarketingPage>
    );
  }
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 bg-ink px-4 py-2 text-center text-sm text-white shadow">
        Preview of unpublished draft ·{" "}
        <Link to="/admin/service-pages" className="underline">
          Back to editor
        </Link>
      </div>
      <ServiceDetailView page={toServicePreview(page)} />
    </>
  );
}
