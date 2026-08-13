import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";

import { getApiBaseUrl, getCasesApi } from "../../api/runtime";
import type { CaseResponse } from "../../api/types";
import { LoadingState } from "../../components/patterns/LoadingState";
import { TaskRows } from "../../components/patterns/TaskRows";
import { Button } from "../../components/primitives/Button";
import { Callout } from "../../components/primitives/Callout";
import { Card } from "../../components/primitives/Card";
import { TextArea } from "../../components/primitives/TextArea";
import { DEMO_REQUEST, REQUEST_MAX_LENGTH } from "./constants";
import styles from "./IntakeForm.module.css";

type IntakeValues = {
  request_text: string;
};

const INTAKE_STAGES = [
  { id: "request", label: "Request" },
  { id: "evidence", label: "Evidence" },
  { id: "brief", label: "Brief" },
  { id: "review", label: "Human review" },
  { id: "outcome", label: "Outcome" },
] as const;

export function IntakeForm({
  createCase,
}: {
  createCase?: (requestText: string) => Promise<CaseResponse>;
}) {
  const navigate = useNavigate();
  const submitCase = createCase ?? ((requestText: string) => getCasesApi().create(requestText));
  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    watch,
    getValues,
    formState: { errors },
  } = useForm<IntakeValues>({
    defaultValues: { request_text: "" },
  });
  const requestText = watch("request_text");
  const remaining = REQUEST_MAX_LENGTH - requestText.length;
  const mutation = useMutation({
    mutationFn: (requestText: string) => submitCase(requestText),
    onSuccess: (created) => {
      void navigate(`/cases/${created.case_id}`);
    },
  });

  useEffect(() => {
    if (!mutation.isPending) {
      return;
    }
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [mutation.isPending]);

  const field = register("request_text", {
    validate: (value) =>
      value.trim().length > 0 || "Describe the support issue before analyzing.",
    maxLength: {
      value: REQUEST_MAX_LENGTH,
      message: `Keep the request under ${REQUEST_MAX_LENGTH} characters.`,
    },
  });

  return (
    <Card className={styles.form}>
      <form
        className={styles.form}
        onSubmit={handleSubmit(
          (values) => mutation.mutate(values.request_text.trim()),
          () => setFocus("request_text"),
        )}
      >
        <TextArea
          {...field}
          label="Describe the support issue"
          hint={`${remaining} characters remaining`}
          error={errors.request_text?.message}
          disabled={mutation.isPending}
        />
        <p className={styles.note}>
          Synthetic and local data only for this demo. The API will gather fixture evidence and
          pause at the human gate. No incident is created until you approve it.
        </p>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            disabled={mutation.isPending}
            onClick={() => setValue("request_text", DEMO_REQUEST, { shouldValidate: true })}
          >
            Use demo request
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Analyze request
          </Button>
        </div>
      </form>
      {mutation.isPending ? (
        <>
          <LoadingState label="The API is running intake through the human review gate." />
          <TaskRows
            items={INTAKE_STAGES.map((stage) => ({
              id: stage.id,
              label: stage.label,
              status: "running",
            }))}
          />
        </>
      ) : null}
      {mutation.isError ? (
        <Callout tone="danger" title="The API could not create this case">
          <p role="alert">{mutation.error.message}</p>
          <p>Retry against {getApiBaseUrl()}.</p>
          <Button onClick={() => mutation.mutate(getValues("request_text").trim())}>
            Retry analysis
          </Button>
        </Callout>
      ) : null}
    </Card>
  );
}
