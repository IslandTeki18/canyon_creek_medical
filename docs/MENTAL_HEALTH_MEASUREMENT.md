# Mental health measurement

Assessment instruments are controlled through `assessmentDefinitions` and
immutable published `assessmentVersions`. Each version pins a form version,
weighted score mapping, interpretation ranges, licensing metadata, effective
dates, and response rules.

Scores are calculated only in the Convex submission mutation. Raw answers and
the exact instrument version remain attached to the submitted response.
Interpretation labels are instrument guidance, not diagnoses.

Response rules create high-priority `clinicalReviewTasks` for human review and
return practice-approved instructions to the patient. They never change a
diagnosis, medication, or appointment. Acknowledgement and disposition are
audited.

Initial psychiatric evaluations use administrator-approved required/optional
section configuration. Patient-reported sections retain provenance, clinical
records remain references, and signing the encounter locks the evaluation.
Corrections use the encounter amendment workflow.
