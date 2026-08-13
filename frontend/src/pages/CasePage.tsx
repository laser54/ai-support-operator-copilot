import { useParams } from "react-router";

export function CasePage() {
  const { caseId } = useParams();

  return (
    <main>
      <h1>Case {caseId}</h1>
    </main>
  );
}
