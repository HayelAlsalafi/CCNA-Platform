# Source and editorial notes

Blueprint identity, parent objective codes and domain weights were checked on **2026-10-13** against [Cisco's current exam page](https://www.cisco.com/site/us/en/learn/training-certifications/exams/ccna.html) and [Cisco's v1.1 topic PDF](https://learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf). Source URL and explicit verification timestamp are in the blueprint payload. This pack is tied to v1.1; future revisions require separate content review.

Topic/option/explanation text is original. Objective descriptions are local navigation labels. No book edition/chapter titles were used, and no complete-coverage or Cisco-endorsement claim is made.

Primary technical references for specific details:

- [RFC 1918](https://www.rfc-editor.org/rfc/rfc1918.html): private-address ranges in S7-D1-Q08.
- [RFC 4291](https://www.rfc-editor.org/rfc/inline-errata/rfc4291.html): link-local unicast and modified EUI-64 in S7-D1-Q09/Q10.
- [RFC 2328](https://www.rfc-editor.org/rfc/rfc2328.html), sections 9.4 and 10.5: DR election and hello compatibility in S7-D3-Q07/Q08.
- [RFC 2131](https://www.rfc-editor.org/rfc/rfc2131.html): DHCP ports in S7-D4-Q05.
- [Cisco SSH guidance](https://www.cisco.com/c/en/us/support/docs/security-vpn/secure-shell-ssh/4145-ssh.html): IOS RSA/local-login setup in S7-D4-Q10 and S7-D5-Q02.
- [Cisco DAI troubleshooting](https://www.cisco.com/c/en/us/support/docs/switches/lan-switch-software/222274-troubleshoot-dynamic-arp-inspection-dai.html): trust boundaries/ARP bindings in S7-D5-Q07/Q08.
- [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259.html): JSON booleans, arrays, numbers and objects in S7-D6-Q05.

Activities are proposals for an approved lab/simulator, not executed device changes. Documentation address ranges are illustrative. Platform-specific prompts state assumptions, including native-VLAN defaults, centrally switched WLANs and IOS SSH using RSA host keys.
