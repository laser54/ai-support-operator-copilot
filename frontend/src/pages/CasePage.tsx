import { useParams } from "react-router";

export function CasePage() {
  const { caseId } = useParams();

  return (
    <>
      <h1>Case {caseId}</h1>
    </>
  );
}
