# CCNA 200-301 v1.1 pilot curriculum

Original topics; no Official Cert Guide chapter attribution. Ten questions per domain is a balanced pilot, not an exam-weighted simulation.

Source: [Cisco exam topics](https://learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf). Version/codes/weights checked 2026-10-13T06:19:29.000Z. Objective descriptions are local navigation summaries, not quotations.

| Domain | Exam weight | Topics | Questions |
| --- | ---: | ---: | ---: |
| 1.0 Network Fundamentals | 20% | 4 | 10 |
| 2.0 Network Access | 20% | 4 | 10 |
| 3.0 IP Connectivity | 25% | 4 | 10 |
| 4.0 IP Services | 10% | 4 | 10 |
| 5.0 Security Fundamentals | 15% | 4 | 10 |
| 6.0 Automation and Programmability | 10% | 4 | 10 |

Topic/objective links below are curriculum documentation; the existing database associates objectives with questions, not directly with topics. Topic descriptions retain these references.

## 1.0 Network Fundamentals

### D1T1: Devices, topologies and Ethernet forwarding

Slug: `ccna-v1-1-s7-network-devices`; objectives: 1.1, 1.2, 1.13.

Understand how switches forward frames within a VLAN and routers connect IP networks. Trace source-MAC learning and unknown-unicast flooding. Compare access/distribution designs with spine-leaf fabrics, and distinguish a device's forwarding role from the topology around it.

Practice activity: Sketch two VLANs and a router, then trace one local frame and one routed packet.

Questions: S7-D1-Q01, S7-D1-Q02, S7-D1-Q03.

### D1T2: Cabling, interface faults and transport protocols

Slug: `ccna-v1-1-s7-media-and-transport`; objectives: 1.3, 1.4, 1.5.

Select copper, multimode or single-mode fiber based on distance and installation needs. Use interface counters to investigate speed and duplex problems. Explain why TCP provides retransmission and ordered delivery while UDP leaves reliability to the application.

Practice activity: Compare interface status and error counters on two linked switch ports; identify which settings must agree.

Questions: S7-D1-Q04, S7-D1-Q05, S7-D1-Q06.

### D1T3: IPv4 subnets and private addressing

Slug: `ccna-v1-1-s7-ipv4-subnetting`; objectives: 1.6, 1.7, 1.10.

Calculate a subnet's network, usable-host range and broadcast address from its prefix. Recognize private IPv4 ranges and verify a client's address, mask and default gateway. Explain why sharing a subnet is different from merely sharing the first three octets.

Practice activity: Divide a /24 into four /26 networks and assign valid host and gateway addresses.

Questions: S7-D1-Q07, S7-D1-Q08.

### D1T4: IPv6 prefixes and address types

Slug: `ccna-v1-1-s7-ipv6-addressing`; objectives: 1.8, 1.9.

Read and compress IPv6 addresses, distinguish global, unique-local, link-local and multicast addresses, and explain anycast. Work through modified EUI-64 by inserting FFFE and toggling the universal/local bit. Link-local addresses support communication on one link rather than routed Internet access.

Practice activity: Configure two IPv6 hosts on one /64 and inspect their link-local addresses and neighbor tables.

Questions: S7-D1-Q09, S7-D1-Q10.

Objectives without a pilot question: 1.8, 1.10, 1.11, 1.12.

## 2.0 Network Access

### D2T1: VLAN access ports and 802.1Q trunks

Slug: `ccna-v1-1-s7-vlans-and-trunks`; objectives: 2.1, 2.2.

Assign endpoint ports to data VLANs and carry multiple VLANs over an 802.1Q trunk. Distinguish VLAN membership, allowed VLANs and the native VLAN. Diagnose why a VLAN works locally but fails across a trunk, and identify where inter-VLAN routing is required.

Practice activity: Create VLANs 10 and 20 on two switches; deliberately omit VLAN 20 from the trunk and verify the fault.

Questions: S7-D2-Q01, S7-D2-Q02, S7-D2-Q03.

### D2T2: Rapid PVST+ protection and LACP EtherChannel

Slug: `ccna-v1-1-s7-stp-and-etherchannel`; objectives: 2.4, 2.5.

Explain bridge-ID root selection and how spanning tree prevents loops. Combine compatible links using LACP, recognizing active/passive negotiation. Apply edge-port protections thoughtfully: PortFast accelerates endpoint access, while BPDU guard reacts to unexpected spanning-tree participation.

Practice activity: Compare LACP active/passive with passive/passive, then inspect spanning-tree root and port roles.

Questions: S7-D2-Q04, S7-D2-Q05, S7-D2-Q06.

### D2T3: Neighbor discovery and management access

Slug: `ccna-v1-1-s7-discovery-and-management`; objectives: 2.3, 2.8.

Use CDP and LLDP to document directly connected neighbors and their port identities. Choose management access appropriate to the task: local console access differs from remote SSH. Recognize that Telnet exposes session content and that encrypted management still requires authentication and authorization.

Practice activity: Build a neighbor table from LLDP output and compare console, Telnet and SSH access paths.

Questions: S7-D2-Q07, S7-D2-Q08.

### D2T4: Controller-based WLANs and client connectivity

Slug: `ccna-v1-1-s7-controller-wlan`; objectives: 2.6, 2.7, 2.9.

Distinguish AP connectivity, controller control functions and client data paths. Interpret WLAN configuration by matching SSID, VLAN/interface mapping and security settings. Different forwarding modes exist; do not assume that every managed AP tunnels every client frame through the controller.

Practice activity: Trace a centrally switched WLAN from a client through an AP to the configured controller interface.

Questions: S7-D2-Q09, S7-D2-Q10.

Objectives without a pilot question: 2.7.

## 3.0 IP Connectivity

### D3T1: Routing tables and forwarding decisions

Slug: `ccna-v1-1-s7-routing-table`; objectives: 3.1, 3.2.

Read prefixes, next hops, administrative distance and metrics in a routing entry. Use longest-prefix match when forwarding to a destination. Distinguish installing competing routes to the same prefix from selecting among installed routes with different prefix lengths.

Practice activity: Predict the selected route for several destinations using a table containing /16, /24 and default entries.

Questions: S7-D3-Q01, S7-D3-Q02, S7-D3-Q03.

### D3T2: IPv4 and IPv6 static routes

Slug: `ccna-v1-1-s7-static-routing`; objectives: 3.3.

Configure network, host and default routes using a reachable next hop. Build a floating static route with a higher administrative distance than the preferred source. Verify route installation and next-hop reachability before assuming that a syntactically valid command creates usable connectivity.

Practice activity: Add a primary OSPF path and a higher-distance static backup; inspect the table before and after losing the primary.

Questions: S7-D3-Q04, S7-D3-Q05, S7-D3-Q06.

### D3T3: Single-area OSPFv2 neighbors and elections

Slug: `ccna-v1-1-s7-ospfv2`; objectives: 3.4.

Identify the parameters needed for an OSPF neighbor relationship, including area and hello/dead timers. Compare point-to-point links with broadcast segments. Explain router IDs, interface priorities and DR/BDR elections, including why a later stronger candidate does not automatically replace an established DR.

Practice activity: Inspect OSPF neighbors on a broadcast segment and diagnose deliberately mismatched hello intervals.

Questions: S7-D3-Q07, S7-D3-Q08.

### D3T4: First-hop redundancy for host gateways

Slug: `ccna-v1-1-s7-first-hop-redundancy`; objectives: 3.5.

Explain why a host can lose off-subnet connectivity when its only gateway fails. Use a virtual gateway address and protocol-controlled virtual MAC to maintain a stable host configuration. Distinguish first-hop gateway protection from dynamic routing and from application-server failover.

Practice activity: Draw a two-router virtual gateway and trace how host traffic changes when the active router fails.

Questions: S7-D3-Q09, S7-D3-Q10.

Objectives without a pilot question: none.

## 4.0 IP Services

### D4T1: Static and pooled inside-source NAT

Slug: `ccna-v1-1-s7-inside-source-nat`; objectives: 4.1.

Read an inside-source translation as a mapping between inside-local and inside-global addresses. Compare a persistent one-to-one static mapping with dynamic pool allocation. Recognize that a finite pool without overload cannot give every simultaneous inside host a unique global address.

Practice activity: Inspect static translations and then exhaust a two-address dynamic NAT pool using three active hosts.

Questions: S7-D4-Q01, S7-D4-Q02.

### D4T2: DHCP addressing, relay and DNS resolution

Slug: `ccna-v1-1-s7-dhcp-and-dns`; objectives: 4.3, 4.6.

Separate dynamic address configuration from name resolution. Follow a client's DHCP messages and explain why broadcasts need a relay to reach a server across a router. Use an interface helper address for the server destination and distinguish server and client UDP ports.

Practice activity: Place a DHCP server on a different subnet and compare client behavior before and after configuring relay.

Questions: S7-D4-Q03, S7-D4-Q04, S7-D4-Q05.

### D4T3: NTP, SNMP and syslog operations

Slug: `ccna-v1-1-s7-monitoring-and-time`; objectives: 4.2, 4.4, 4.5.

Synchronize device clocks so that operational events can be correlated. Distinguish SNMP polling/notifications from syslog event reporting. Read severity numbers in the correct direction: lower numbers indicate greater severity, and a logging threshold includes that level and more severe events.

Practice activity: Interpret a sample timeline, SNMP interface counters and syslog messages at a warnings threshold.

Questions: S7-D4-Q06, S7-D4-Q07, S7-D4-Q08.

### D4T4: QoS behavior and secure administration

Slug: `ccna-v1-1-s7-qos-and-secure-operations`; objectives: 4.7, 4.8, 4.9.

Distinguish traffic classification/marking from congestion handling. Compare buffering by shaping with dropping or remarking by policing. Explain SSH's encrypted remote-access channel and the supporting host/domain/RSA setup in IOS. Compare legacy TFTP and FTP capabilities without treating either as inherently secure.

Practice activity: Classify a voice flow, predict shaping versus policing behavior, and review an SSH configuration checklist.

Questions: S7-D4-Q09, S7-D4-Q10.

Objectives without a pilot question: 4.9.

## 5.0 Security Fundamentals

### D5T1: Risk reduction and authenticated device access

Slug: `ccna-v1-1-s7-risk-and-device-access`; objectives: 5.1, 5.2, 5.3, 5.4.

Distinguish a threat, an exploitable vulnerability and a mitigation. Combine patching, awareness and physical safeguards rather than relying on passwords alone. Configure local device login deliberately and distinguish true multifactor authentication from two credentials of the same factor type.

Practice activity: Classify security controls in a branch office and review how a VTY line uses the local username database.

Questions: S7-D5-Q01, S7-D5-Q02, S7-D5-Q03.

### D5T2: Ordered ACL decisions and IPsec VPN use

Slug: `ccna-v1-1-s7-acls-and-vpns`; objectives: 5.5, 5.6.

Evaluate ACL entries from top to bottom and account for implicit denial when no entry matches. Convert an IPv4 prefix to a wildcard mask for a standard ACL. Distinguish remote-user VPN access from a site-to-site encrypted connection between network gateways.

Practice activity: Evaluate specific-host and whole-subnet ACL entries against four packets without changing a live router.

Questions: S7-D5-Q04, S7-D5-Q05, S7-D5-Q06.

### D5T3: DHCP snooping and dynamic ARP inspection

Slug: `ccna-v1-1-s7-layer2-security`; objectives: 5.7.

Protect access VLANs from rogue DHCP replies by distinguishing trusted server-facing links from untrusted client ports. Explain the DHCP snooping binding table and how DAI can use it to validate ARP claims. Recognize that static hosts require an explicitly planned validation method rather than assuming every legitimate host has a DHCP binding.

Practice activity: Mark the trusted DHCP server path, then compare a legitimate and forged ARP sender binding.

Questions: S7-D5-Q07, S7-D5-Q08.

### D5T4: AAA decisions and WLAN authentication

Slug: `ccna-v1-1-s7-aaa-and-wlan-security`; objectives: 5.8, 5.9, 5.10.

Separate proving identity, permitting actions and recording activity. Compare shared-key WLAN authentication with enterprise identity services. Recognize WPA2-Personal's shared passphrase and AES-CCMP, and understand that choosing WPA2-Enterprise introduces a different authentication design rather than merely changing a password field.

Practice activity: Label authentication, authorization and accounting events, then review a WPA2-Personal WLAN configuration.

Questions: S7-D5-Q09, S7-D5-Q10.

Objectives without a pilot question: 5.2, 5.9.

## 6.0 Automation and Programmability

### D6T1: Automation and controller-based networks

Slug: `ccna-v1-1-s7-controller-automation`; objectives: 6.1, 6.2, 6.3.

Explain how repeatable automation reduces configuration variation while still requiring scope checks and validation. Distinguish controller-facing application interfaces from device-facing interfaces. Separate an underlay's IP reachability from logical overlays carried over it; centralized control does not mean the controller forwards every packet.

Practice activity: Draw northbound/southbound interfaces and identify the underlay routes needed by a tunnel-based overlay.

Questions: S7-D6-Q01, S7-D6-Q02, S7-D6-Q03.

### D6T2: REST requests and JSON data interpretation

Slug: `ccna-v1-1-s7-rest-and-json`; objectives: 6.5, 6.7.

Match HTTP methods to read/create/change/delete intentions and interpret common authentication versus authorization failures. Read JSON object keys, arrays, strings, numbers and booleans. Preserve real data types when extracting configuration values; the string "true" is not the JSON boolean true.

Practice activity: Read a sample interface JSON response and design a GET request without putting credentials in logs.

Questions: S7-D6-Q04, S7-D6-Q05, S7-D6-Q06.

### D6T3: Ansible and Terraform configuration workflows

Slug: `ccna-v1-1-s7-ansible-and-terraform`; objectives: 6.6.

Compare task-oriented Ansible playbooks with Terraform's declarative resource configuration, plan and state. Agentless management still needs a supported transport and valid access. Review target scope and intended changes before execution; repeatable tooling is not permission to replace manual approval with blind deployment.

Practice activity: Compare a playbook that configures interfaces with a Terraform plan describing cloud-network resource changes.

Questions: S7-D6-Q07, S7-D6-Q08.

### D6T4: Predictive and generative AI in operations

Slug: `ccna-v1-1-s7-ai-network-operations`; objectives: 6.4.

Distinguish learning patterns from historical telemetry from generating new explanatory or configuration text. Evaluate predictions against actual outcomes and changing conditions. Treat generated device commands as proposals needing platform checks and review; convincing wording is not proof of technical correctness.

Practice activity: Compare a utilization forecast with an AI-generated configuration suggestion and define a validation step for each.

Questions: S7-D6-Q09, S7-D6-Q10.

Objectives without a pilot question: 6.2.

Difficulty: 19 easy, 31 medium, 10 hard. 44/53 parent objectives have a question; this is not complete exam coverage.
