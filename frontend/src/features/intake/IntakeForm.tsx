import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";

import { getApiBaseUrl, getCasesApi } from "../../api/runtime";
import type { CaseResponse } from "../../api/types";
import { TaskRows } from "../../components/patterns/TaskRows";
import { Button } from "../../components/primitives/Button";
import { Callout } from "../../components/primitives/Callout";
import { Card } from "../../components/primitives/Card";
import { TextArea } from "../../components/primitives/TextArea";
import { DEMO_SCENARIOS, REQUEST_MAX_LENGTH } from "./constants";
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

function randomScenarioText(): string {
  const index = Math.floor(Math.random() * DEMO_SCENARIOS.length);
  return DEMO_SCENARIOS[index].text;
}

export function IntakeForm({
  createCase,
}: {
  createCase?: (requestText: string) => Promise<CaseResponse>;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scenarioParam = searchParams.get("scenario");
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

  useEffect(() => {
    if (scenarioParam) {
      const matched = DEMO_SCENARIOS.find((s) => s.id === scenarioParam);
      if (matched) {
        setValue("request_text", matched.text, { shouldValidate: true });
      }
    }
  }, [scenarioParam, setValue]);
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

  function insertDemo(text: string) {
    setValue("request_text", text, { shouldValidate: true });
  }

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
          Evidence is synthetic fixtures, not live systems. You can paste any request; the five
          demos below are just starting points. The API still pauses at the human gate.
        </p>
        <div className={styles.scenarios} role="group" aria-label="Demo scenarios">
          {DEMO_SCENARIOS.map((scenario) => (
            <Button
              key={scenario.id}
              variant="secondary"
              className={styles.scenario}
              disabled={mutation.isPending}
              onClick={() => insertDemo(scenario.text)}
            >
              {scenario.title}
            </Button>
          ))}
          <Button
            variant="secondary"
            className={styles.scenario}
            disabled={mutation.isPending}
            onClick={() => insertDemo(randomScenarioText())}
          >
            Use demo request
          </Button>
        </div>
        <div className={styles.actions}>
          <Button type="submit" loading={mutation.isPending}>
            Analyze request
          </Button>
        </div>
      </form>
      {mutation.isPending ? (
        <div className={styles.aiLoaderBox}>
          <div className={styles.aiLoaderHeader}>
            <div className={styles.aiOrb}>
              <div className={styles.aiOrbInner} />
            </div>
            <div>
              <p className={styles.aiLoaderTitle}>AI Operator Analyzing Request...</p>
              <p className={styles.aiLoaderSub}>
                Extracting telemetry, querying KB fixtures, evaluating policy rules
              </p>
            </div>
          </div>
          <div className={styles.aiProgressBar}>
            <div className={styles.aiProgressFill} />
          </div>
          <TaskRows
            items={INTAKE_STAGES.map((stage) => ({
              id: stage.id,
              label: stage.label,
              status: "running",
            }))}
          />
        </div>
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
