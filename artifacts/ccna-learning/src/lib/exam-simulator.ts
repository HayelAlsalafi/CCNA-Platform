export type DemoExamChoice = { key: string; text: string };

export type DemoExamQuestion = {
  id: string;
  topic: string;
  prompt: string;
  choices: DemoExamChoice[];
  correctKey: string;
  explanation: string;
};

export const DEMO_EXAM_QUESTIONS: DemoExamQuestion[] = [
  {
    id: 'demo-ipv4-network',
    topic: 'Network fundamentals',
    prompt: 'A host is configured with IPv4 address 192.168.10.66/26. Which network contains this host?',
    choices: [
      { key: 'A', text: '192.168.10.0/26' },
      { key: 'B', text: '192.168.10.64/26' },
      { key: 'C', text: '192.168.10.66/26' },
      { key: 'D', text: '192.168.10.128/26' },
    ],
    correctKey: 'B',
    explanation: 'A /26 subnet has a block size of 64 addresses. The range 192.168.10.64–127 includes 192.168.10.66.',
  },
  {
    id: 'demo-arp',
    topic: 'Ethernet and switching',
    prompt: 'Which destination MAC address does a host use for an ARP request on its local Ethernet segment?',
    choices: [
      { key: 'A', text: 'The MAC address of the default gateway' },
      { key: 'B', text: 'FF:FF:FF:FF:FF:FF (broadcast)' },
      { key: 'C', text: '00:00:00:00:00:00 (unspecified)' },
      { key: 'D', text: 'The MAC address of the DNS server' },
    ],
    correctKey: 'B',
    explanation: 'ARP requests are sent to the Ethernet broadcast address so every device on the local broadcast domain can receive the query.',
  },
  {
    id: 'demo-stp',
    topic: 'Ethernet and switching',
    prompt: 'What is the primary purpose of Spanning Tree Protocol in a switched network?',
    choices: [
      { key: 'A', text: 'Encrypt frames between switches' },
      { key: 'B', text: 'Prevent Layer 2 switching loops' },
      { key: 'C', text: 'Assign IP addresses to access ports' },
      { key: 'D', text: 'Prioritize voice traffic with DSCP' },
    ],
    correctKey: 'B',
    explanation: 'STP blocks selected redundant Layer 2 paths to prevent switching loops while retaining redundancy for failover.',
  },
  {
    id: 'demo-ospf',
    topic: 'Routing and forwarding',
    prompt: 'Which OSPF metric determines the preferred path when multiple routes to a destination are available?',
    choices: [
      { key: 'A', text: 'Hop count only' },
      { key: 'B', text: 'Bandwidth-derived cost' },
      { key: 'C', text: 'Administrative distance only' },
      { key: 'D', text: 'Number of active interfaces' },
    ],
    correctKey: 'B',
    explanation: 'OSPF chooses paths using accumulated interface cost. By default, the cost is derived from interface bandwidth.',
  },
  {
    id: 'demo-dhcp',
    topic: 'Network services',
    prompt: 'In the DHCPv4 DORA sequence, which message does a client send after receiving a DHCPOFFER?',
    choices: [
      { key: 'A', text: 'DHCPDISCOVER' },
      { key: 'B', text: 'DHCPREQUEST' },
      { key: 'C', text: 'DHCPACK' },
      { key: 'D', text: 'DHCPRELEASE' },
    ],
    correctKey: 'B',
    explanation: 'The client broadcasts DHCPREQUEST to indicate the offered address it wants to use; the server then responds with DHCPACK.',
  },
  {
    id: 'demo-vlan',
    topic: 'Ethernet and switching',
    prompt: 'Which IEEE standard adds VLAN tags to Ethernet frames on a trunk link?',
    choices: [
      { key: 'A', text: '802.1Q' },
      { key: 'B', text: '802.1X' },
      { key: 'C', text: '802.3af' },
      { key: 'D', text: '802.11ax' },
    ],
    correctKey: 'A',
    explanation: 'IEEE 802.1Q inserts a VLAN tag in Ethernet frames to identify their VLAN across a trunk.',
  },
  {
    id: 'demo-icmp',
    topic: 'IP connectivity',
    prompt: 'A router receives a packet whose TTL reaches zero while being forwarded. What does the router normally do?',
    choices: [
      { key: 'A', text: 'Forward the packet with TTL set to 255' },
      { key: 'B', text: 'Discard the packet and send ICMP Time Exceeded' },
      { key: 'C', text: 'Place the packet in its ARP cache' },
      { key: 'D', text: 'Fragment the packet and forward it' },
    ],
    correctKey: 'B',
    explanation: 'Routers decrement the TTL at each hop. When it reaches zero, the packet is discarded and an ICMP Time Exceeded message is typically sent.',
  },
  {
    id: 'demo-wifi',
    topic: 'Wireless',
    prompt: 'Which Wi-Fi band generally provides greater coverage through walls, with fewer non-overlapping channels than 5 GHz?',
    choices: [
      { key: 'A', text: '2.4 GHz' },
      { key: 'B', text: '5 GHz' },
      { key: 'C', text: '6 GHz' },
      { key: 'D', text: '60 GHz' },
    ],
    correctKey: 'A',
    explanation: 'The 2.4 GHz band generally propagates farther and penetrates obstacles better than higher-frequency bands, but offers fewer non-overlapping channels.',
  },
  {
    id: 'demo-nat',
    topic: 'IP connectivity',
    prompt: 'What does NAT overload (PAT) use to let multiple inside hosts share one public IPv4 address?',
    choices: [
      { key: 'A', text: 'Unique source port numbers' },
      { key: 'B', text: 'A unique VLAN per connection' },
      { key: 'C', text: 'A different public subnet for every host' },
      { key: 'D', text: 'The OSPF router ID' },
    ],
    correctKey: 'A',
    explanation: 'Port Address Translation differentiates simultaneous translations with transport-layer port numbers while sharing a public IPv4 address.',
  },
  {
    id: 'demo-acl',
    topic: 'Security fundamentals',
    prompt: 'What is the usual behavior of a Cisco-style access control list when no entry matches a packet?',
    choices: [
      { key: 'A', text: 'Permit the packet by default' },
      { key: 'B', text: 'Apply the next ACL on the interface' },
      { key: 'C', text: 'Deny the packet by the implicit final deny' },
      { key: 'D', text: 'Send an ARP request for the source' },
    ],
    correctKey: 'C',
    explanation: 'ACLs end with an implicit deny. Traffic must match an explicit permit entry to pass.',
  },
];

export const EXAM_QUESTION_COUNTS = [5, 10] as const;
export const EXAM_DURATION_MINUTES = [15, 30, 60] as const;

export type ExamConfiguration = {
  questionCount: number;
  durationMinutes: number;
};

export type ActiveExam = {
  questions: DemoExamQuestion[];
  answers: Record<string, string>;
  flaggedQuestionIds: string[];
  currentIndex: number;
  remainingSeconds: number;
  startedAt: number;
  expiresAt: number;
};

export type ExamQuestionResult = {
  question: DemoExamQuestion;
  selectedKey: string | null;
  isCorrect: boolean;
};

export type ExamResult = {
  score: number;
  total: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  questions: ExamQuestionResult[];
};

export function createExam(
  configuration: ExamConfiguration,
  questions: readonly DemoExamQuestion[] = DEMO_EXAM_QUESTIONS,
  now = Date.now(),
): ActiveExam {
  const questionCount = Math.min(Math.max(Math.floor(configuration.questionCount), 1), questions.length);
  const durationMinutes = Math.max(1, configuration.durationMinutes);
  return {
    questions: [...questions].slice(0, questionCount),
    answers: {},
    flaggedQuestionIds: [],
    currentIndex: 0,
    remainingSeconds: Math.floor(durationMinutes * 60),
    startedAt: now,
    expiresAt: now + Math.floor(durationMinutes * 60) * 1000,
  };
}

export function setExamAnswer(exam: ActiveExam, questionId: string, answerKey: string): ActiveExam {
  if (!exam.questions.some((question) => question.id === questionId)) return exam;
  return { ...exam, answers: { ...exam.answers, [questionId]: answerKey } };
}

export function toggleExamFlag(exam: ActiveExam, questionId: string): ActiveExam {
  if (!exam.questions.some((question) => question.id === questionId)) return exam;
  const isFlagged = exam.flaggedQuestionIds.includes(questionId);
  return {
    ...exam,
    flaggedQuestionIds: isFlagged
      ? exam.flaggedQuestionIds.filter((id) => id !== questionId)
      : [...exam.flaggedQuestionIds, questionId],
  };
}

export function navigateExam(exam: ActiveExam, index: number): ActiveExam {
  return { ...exam, currentIndex: Math.min(Math.max(index, 0), exam.questions.length - 1) };
}

export function tickExam(exam: ActiveExam, now = Date.now()): ActiveExam {
  const remainingSeconds = Math.max(0, Math.ceil((exam.expiresAt - now) / 1000));
  return { ...exam, remainingSeconds: Math.min(exam.remainingSeconds, remainingSeconds) };
}

export function gradeExam(exam: ActiveExam): ExamResult {
  const questions = exam.questions.map((question) => {
    const selectedKey = exam.answers[question.id] ?? null;
    return { question, selectedKey, isCorrect: selectedKey === question.correctKey };
  });
  const correctCount = questions.filter((result) => result.isCorrect).length;
  const answeredCount = questions.filter((result) => result.selectedKey !== null).length;
  return {
    score: correctCount,
    total: questions.length,
    percentage: questions.length ? Math.round((correctCount / questions.length) * 100) : 0,
    correctCount,
    incorrectCount: answeredCount - correctCount,
    unansweredCount: questions.length - answeredCount,
    questions,
  };
}

export function formatExamTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}
