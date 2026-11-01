# Explicit topic mapping

Mappings live in `artifacts/api-server/src/lib/curriculum-config.ts`. The exact topic slug is the reviewed lookup key; the original UUID remains the identity used by questions, attempts, revisions, deliveries and practice links. Shared chapter references never merge topics or move questions. Duplicate IDs/slugs are classified as ambiguous and excluded from learner navigation.

## Reviewed Sprint 7 source mappings

| Topic slug suffix (prefix `ccna-v1-1-s7-`) | Chapter IDs                                  |
| ------------------------------------------ | -------------------------------------------- |
| network-devices                            | d1-c1                                        |
| media-and-transport                        | d1-c2, d1-c1                                 |
| ipv4-subnetting                            | d1-c4                                        |
| ipv6-addressing                            | d1-c5                                        |
| vlans-and-trunks                           | d2-c4                                        |
| stp-and-etherchannel                       | d2-c5                                        |
| discovery-and-management                   | d2-c3                                        |
| controller-wlan                            | d2-c6                                        |
| routing-table                              | d3-c1                                        |
| static-routing                             | d3-c2, d3-c6                                 |
| ospfv2                                     | d3-c5                                        |
| first-hop-redundancy                       | d3-c3                                        |
| inside-source-nat                          | d4-c2                                        |
| dhcp-and-dns                               | d4-c1                                        |
| monitoring-and-time                        | d4-c3                                        |
| qos-and-secure-operations                  | d4-c4, d4-c5                                 |
| risk-and-device-access                     | d5-c1, d5-c2                                 |
| acls-and-vpns                              | d5-c3                                        |
| layer2-security                            | d5-c5                                        |
| aaa-and-wlan-security                      | d5-c6                                        |
| controller-automation                      | d6-c1, d6-c2                                 |
| rest-and-json                              | d6-c3                                        |
| ansible-and-terraform                      | d6-c4                                        |
| ai-network-operations                      | Unmapped: no corresponding requested chapter |

This offline report covers the authored source pack: **23 mapped, 1 unmapped, 0 ambiguous**. It is not a claim that these records currently exist in PostgreSQL. No live database was inspected during implementation. Topics with overlapping concepts retain their original descriptions: the controller topic is an introduction, not full SD-Access coverage; the Ansible/Terraform topic provides Ansible material, not Puppet/Chef coverage. Empty chapters remain empty instead of being filled with unrelated content.

## Actual database report

On `/topics`, a server-authorized active ADMIN can expand **Unmapped Topics / Admin review**. `GET /api/admin/curriculum/mapping` uses the existing authentication and ADMIN middleware, includes ACTIVE and DISABLED topic metadata, and returns mapped/unmapped/ambiguous groups with actual IDs, slugs, statuses and reasons. Learners cannot access that report; their curriculum response contains no unmapped/ambiguous topic metadata. Expand the review area to obtain current database counts; it does not run automatically for every card click.

Any exact slug without a reviewed rule goes to the review area, including unidentified legacy/test content. No title guessing, silent merging, topic creation or status changes occur. Existing topics/questions remain available through their existing supported interfaces and practice selector subject to the original visibility rules. Historical attempts remain in the dashboard/history; curriculum browsing does not delete or rewrite them.

To approve a new mapping, identify its actual UUID/slug and read its topic scope in Admin. Choose a requested chapter with supported overlap, add that exact slug to the configuration and test it. Multiple chapter references are permitted explicitly, but topic-level practice still draws from the entire existing topic. Chapter-specific question filtering is not fabricated. If scope is uncertain, leave the topic unmapped.
