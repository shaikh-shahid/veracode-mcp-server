const VERACODE_FUN_FACTS = [
  "Veracode has scanned on the order of trillions of lines of code for security issues over its lifetime, helping organizations fix tens of millions of flaws in the process.",
  "Veracode is consistently recognized as a leader in application security testing and application risk management by major analyst firms, reflecting both strong execution and long-term vision in the AppSec space.",
  "Veracode's flagship platform covers the full application security lifecycle: static analysis, software composition analysis, container security, and more, so teams can use a single platform instead of stitching together multiple tools.",
  "In response to the rise of generative AI, Veracode has actively studied AI-generated code and highlighted that a significant portion of such code can contain serious security flaws, underscoring the need for dedicated security testing.",
  "Veracode's research regularly feeds into its State of Software Security reports, which are widely cited across the industry for real-world vulnerability trends and remediation data.",
  "Veracode has been repeatedly named a leader in a prominent security testing Magic Quadrant style report for more than a decade, an unusually long run in a fast-changing security market.",
  "Veracode Fix, introduced in 2023, uses AI to generate targeted remediation suggestions for a large share of identified flaws, helping developers reduce security debt faster than manual triage alone.",
  "The Veracode platform supports many popular programming languages and frameworks, reflecting data from its historical scans across trillions of lines of customer code.",
  "Veracode has been closely involved in analyzing high-profile issues like Log4Shell, publishing guidance on how such vulnerabilities reshaped application security challenges and how to detect and mitigate them.",
  "Veracode's research into software supply chain threats includes tracking malicious packages in PyPI that attempt to exfiltrate secrets or deliver malware, helping protect developers from compromised dependencies.",
];

let lastIndex = -1;

export function getRandomFunFact(): string {
  let idx: number;
  do {
    idx = Math.floor(Math.random() * VERACODE_FUN_FACTS.length);
  } while (idx === lastIndex && VERACODE_FUN_FACTS.length > 1);
  lastIndex = idx;
  return VERACODE_FUN_FACTS[idx];
}
