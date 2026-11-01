# Original CCNA v1.1 pilot questions

Admin/editor review copy: contains answer keys. No live IDs or actual exam questions.

## S7-D1-Q01 - Devices, topologies and Ethernet forwarding

EASY | Domain 1.0 | Primary objective 1.1 | Topic slug: `ccna-v1-1-s7-network-devices`

An office has hosts in VLAN 10 and VLAN 20. The access switch only performs Layer 2 forwarding. What additional function is needed for hosts in the two VLANs to communicate?

- **A.** Layer 3 routing between the VLANs
- **B.** Increasing the MAC-address aging timer
- **C.** Replacing every access port with a trunk port
- **D.** Disabling source-MAC learning

**Correct: A.** Each VLAN is a separate Layer 2 broadcast domain. A router or a routing-capable switch must provide Layer 3 forwarding between their IP networks. MAC aging and trunking alone do not perform inter-VLAN routing.

## S7-D1-Q02 - Devices, topologies and Ethernet forwarding

MEDIUM | Domain 1.0 | Primary objective 1.13 | Topic slug: `ccna-v1-1-s7-network-devices`

A switch receives a unicast Ethernet frame on an access port in VLAN 30. The source MAC is new and the destination MAC is absent from its MAC table. What does it normally do?

- **A.** Learn the destination on the ingress port and discard the frame
- **B.** Learn the source on the ingress port and flood the frame to other forwarding ports in VLAN 30
- **C.** Flood the frame into every VLAN configured on the switch
- **D.** Send an ARP request on behalf of the destination before forwarding

**Correct: B.** A switch learns from the source MAC and VLAN of an arriving frame. An unknown unicast is flooded only within that VLAN, excluding the ingress port and nonforwarding ports. It does not infer the destination's location from the source or flood across VLAN boundaries.

## S7-D1-Q03 - Devices, topologies and Ethernet forwarding

MEDIUM | Domain 1.0 | Primary objective 1.2 | Topic slug: `ccna-v1-1-s7-network-devices`

In a basic spine-leaf fabric, every leaf connects to every spine and leaves do not connect directly to one another. How many intermediate spine devices are on a normal path between hosts attached to different leaves?

- **A.** Zero spines because the leaves have direct links
- **B.** Every spine in the fabric
- **C.** One spine
- **D.** Two spines connected in series

**Correct: C.** The normal inter-leaf path is source leaf, one selected spine, then destination leaf. Multiple spine choices provide path diversity, but a packet does not traverse all of them or two spines in series in this basic topology.

## S7-D1-Q04 - Cabling, interface faults and transport protocols

EASY | Domain 1.0 | Primary objective 1.3 | Topic slug: `ccna-v1-1-s7-media-and-transport`

An organization needs a fiber Ethernet link spanning several kilometers between buildings. Appropriate transceivers will be selected for the distance. Which medium is generally the suitable choice?

- **A.** Category 6 copper for the entire distance without intermediate devices
- **B.** A standard passive twinax cable for the entire distance
- **C.** Multimode fiber chosen without regard to its supported distance
- **D.** Single-mode fiber

**Correct: D.** Single-mode fiber with suitable optics supports longer distances than typical multimode Ethernet links. Copper and passive twinax links have much shorter reach. Actual compatibility still depends on the transceiver, optical budget, fiber and supported link standard.

## S7-D1-Q05 - Cabling, interface faults and transport protocols

MEDIUM | Domain 1.0 | Primary objective 1.4 | Topic slug: `ccna-v1-1-s7-media-and-transport`

Both ends of an Ethernet link show 100 Mb/s. One end is forced to full duplex and the other operates at half duplex. The half-duplex interface records late collisions. What should be investigated first?

- **A.** A duplex mismatch between the two endpoints
- **B.** An IPv4 default-gateway mismatch
- **C.** An OSPF router-ID collision
- **D.** A DNS search-domain mismatch

**Correct: A.** A half-duplex endpoint uses collision detection while the full-duplex endpoint can transmit and receive simultaneously. Their conflicting behavior can produce late collisions and other errors. Verify both ends' duplex settings; these symptoms do not originate in routing or DNS configuration.

## S7-D1-Q06 - Cabling, interface faults and transport protocols

EASY | Domain 1.0 | Primary objective 1.5 | Topic slug: `ccna-v1-1-s7-media-and-transport`

A file-transfer application requires reliable, ordered delivery over IP. Which transport provides sequence tracking, acknowledgments and retransmission as part of the transport protocol?

- **A.** UDP
- **B.** TCP
- **C.** ICMP
- **D.** ARP

**Correct: B.** TCP provides a reliable ordered byte stream using sequence numbers, acknowledgments and retransmission. UDP provides datagrams without those built-in delivery guarantees. ICMP reports IP-layer information, and ARP resolves IPv4 neighbors on a link; neither is the requested transport.

## S7-D1-Q07 - IPv4 subnets and private addressing

HARD | Domain 1.0 | Primary objective 1.6 | Topic slug: `ccna-v1-1-s7-ipv4-subnetting`

A LAN uses 10.10.5.64/26 with conventional IPv4 network and broadcast addressing. Which pair gives its first and last usable host addresses?

- **A.** 10.10.5.64 and 10.10.5.127
- **B.** 10.10.5.65 and 10.10.5.128
- **C.** 10.10.5.65 and 10.10.5.126
- **D.** 10.10.5.1 and 10.10.5.62

**Correct: C.** A /26 has 64 addresses per block. This block runs from .64 through .127: .64 is the network address and .127 is the directed broadcast. Conventional host addresses are therefore .65 through .126, giving 62 usable hosts.

## S7-D1-Q08 - IPv4 subnets and private addressing

EASY | Domain 1.0 | Primary objective 1.7 | Topic slug: `ccna-v1-1-s7-ipv4-subnetting`

Which address is in an RFC 1918 private IPv4 range?

- **A.** 172.32.8.9
- **B.** 192.169.8.9
- **C.** 11.20.8.9
- **D.** 172.20.8.9

**Correct: D.** The private ranges are 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16. The 172.16/12 range includes second octets 16 through 31, so 172.20.8.9 is private. The other choices are outside these ranges; being outside RFC 1918 does not by itself guarantee Internet reachability.

## S7-D1-Q09 - IPv6 prefixes and address types

EASY | Domain 1.0 | Primary objective 1.9 | Topic slug: `ccna-v1-1-s7-ipv6-addressing`

Which IPv6 unicast address is link-local and intended for communication on a single link rather than forwarding across routers?

- **A.** fe80::1234
- **B.** 2001:db8:1::1234
- **C.** fd12:3456:789a::1234
- **D.** ff02::1

**Correct: A.** Link-local unicast addresses use fe80::/10; fe80::1234 fits that scope. The fd12 address is unique-local, ff02::1 is link-local-scope multicast rather than link-local unicast, and 2001:db8 is reserved for documentation. Routers do not forward link-local unicast traffic to another link.

## S7-D1-Q10 - IPv6 prefixes and address types

HARD | Domain 1.0 | Primary objective 1.9 | Topic slug: `ccna-v1-1-s7-ipv6-addressing`

An IPv6 interface identifier is derived from MAC address 00:25:96:12:34:56 using modified EUI-64. What is the resulting 64-bit interface identifier?

- **A.** 0025:96ff:fe12:3456
- **B.** 0225:96ff:fe12:3456
- **C.** 0225:9612:fffe:3456
- **D.** 0025:9612:3456:fffe

**Correct: B.** Insert ff:fe between the first three and last three MAC bytes, then invert the universal/local bit in the first byte. The first byte changes from 00 to 02. The eight bytes become 02:25:96:ff:fe:12:34:56, written 0225:96ff:fe12:3456. This identifier is not the entire IPv6 address.

## S7-D2-Q01 - VLAN access ports and 802.1Q trunks

EASY | Domain 2.0 | Primary objective 2.1 | Topic slug: `ccna-v1-1-s7-vlans-and-trunks`

A non-VLAN-aware PC should belong to VLAN 20 on a Cisco switch. Which interface command assigns an already configured access port to that VLAN?

- **A.** switchport trunk native vlan 20
- **B.** ip default-gateway 20
- **C.** switchport access vlan 20
- **D.** channel-group 20 mode active

**Correct: C.** An access port's data-VLAN membership is set with switchport access vlan 20. A trunk native VLAN setting applies to trunk behavior, not the requested access membership. The port should operate in access mode and VLAN 20 must exist.

## S7-D2-Q02 - VLAN access ports and 802.1Q trunks

MEDIUM | Domain 2.0 | Primary objective 2.2 | Topic slug: `ccna-v1-1-s7-vlans-and-trunks`

An 802.1Q trunk uses its default native-VLAN tagging behavior, and native VLAN tagging has not been enabled. How is ordinary native-VLAN traffic transmitted on that trunk?

- **A.** With two nested 802.1Q tags
- **B.** Only as an IP multicast packet
- **C.** With a VLAN tag whose value is always zero
- **D.** Without an 802.1Q VLAN tag

**Correct: D.** Under the stated default behavior, native-VLAN frames are sent untagged on an 802.1Q trunk. Other carried VLANs are tagged. Explicit native-VLAN tagging configuration can change this behavior, so the question's configuration assumptions matter.

## S7-D2-Q03 - VLAN access ports and 802.1Q trunks

MEDIUM | Domain 2.0 | Primary objective 2.2 | Topic slug: `ccna-v1-1-s7-vlans-and-trunks`

VLAN 20 exists on both switches and its access ports work locally. Their trunk is up, but its allowed list contains only VLAN 10. What change directly addresses VLAN 20's interswitch failure?

- **A.** Add VLAN 20 to the trunk's allowed VLAN list on the relevant ends
- **B.** Change VLAN 20's hosts to the VLAN 10 subnet while leaving the ports unchanged
- **C.** Increase the switch's MAC aging timer
- **D.** Enable PortFast on every trunk to override the allowed list

**Correct: A.** A trunk only carries VLANs permitted by its allowed list, subject to other forwarding conditions. VLAN 20 must be allowed along the path. Host address changes and MAC timers do not repair VLAN filtering, and PortFast does not override an allowed list.

## S7-D2-Q04 - Rapid PVST+ protection and LACP EtherChannel

MEDIUM | Domain 2.0 | Primary objective 2.4 | Topic slug: `ccna-v1-1-s7-stp-and-etherchannel`

Two otherwise compatible switch ports are being bundled with LACP. One side uses active mode. Which peer mode can negotiate an EtherChannel with it?

- **A.** PAgP auto mode without LACP
- **B.** Passive mode
- **C.** LACP passive on both sides after changing the active side to passive
- **D.** A shutdown interface

**Correct: B.** LACP active initiates negotiation and passive responds, so active/passive can form a bundle when the remaining parameters match. Passive/passive does not initiate negotiation. PAgP uses a different protocol, and an administratively down link cannot negotiate.

## S7-D2-Q05 - Rapid PVST+ protection and LACP EtherChannel

HARD | Domain 2.0 | Primary objective 2.5 | Topic slug: `ccna-v1-1-s7-stp-and-etherchannel`

For VLAN 10, two switches have the same configured bridge priority and VLAN system-ID extension. Switch A has MAC 0011.2233.4400 and switch B has MAC 0011.2233.5500. Which switch becomes the root bridge, assuming no lower bridge ID exists?

- **A.** Switch B, because the larger MAC indicates a newer switch
- **B.** The switch with the highest-numbered access port
- **C.** Switch A, because its MAC portion makes its bridge ID lower
- **D.** Neither, because equal priorities prevent an election

**Correct: C.** Spanning tree elects the lowest bridge ID. When priority and the VLAN system-ID extension are equal, the lower MAC address breaks the tie. 0011.2233.4400 is lower than 0011.2233.5500; port numbering and device age do not select the root.

## S7-D2-Q06 - Rapid PVST+ protection and LACP EtherChannel

MEDIUM | Domain 2.0 | Primary objective 2.5 | Topic slug: `ccna-v1-1-s7-stp-and-etherchannel`

An endpoint-facing port has PortFast and BPDU guard enabled. A small switch is connected and sends a BPDU. What is the expected BPDU guard response?

- **A.** Automatically make the new switch the root bridge
- **B.** Convert the port to a routed interface
- **C.** Ignore all BPDUs indefinitely while continuing to forward
- **D.** Place the protected port into an error-disabled state

**Correct: D.** BPDU guard protects an edge port from unexpected BPDUs by error-disabling it. PortFast alone accelerates transition to forwarding; it does not authorize attaching another spanning-tree participant. Investigate the cause before recovering the port.

## S7-D2-Q07 - Neighbor discovery and management access

EASY | Domain 2.0 | Primary objective 2.3 | Topic slug: `ccna-v1-1-s7-discovery-and-management`

A network uses switches from several vendors. Which standards-based protocol can report directly connected neighbor and port information when supported and enabled on those devices?

- **A.** LLDP
- **B.** OSPF
- **C.** NTP
- **D.** DHCP relay

**Correct: A.** LLDP is a vendor-neutral link-layer discovery protocol that advertises local device and port information. OSPF exchanges routing information, NTP synchronizes clocks, and DHCP relay forwards address-configuration messages. Neighbor discovery must be enabled on the relevant links.

## S7-D2-Q08 - Neighbor discovery and management access

EASY | Domain 2.0 | Primary objective 2.8 | Topic slug: `ccna-v1-1-s7-discovery-and-management`

An administrator needs encrypted remote CLI access to a switch across an IP network. Which management method is appropriate?

- **A.** Telnet
- **B.** SSH
- **C.** An unencrypted HTTP-only management session
- **D.** CDP neighbor advertisements

**Correct: B.** SSH encrypts the remote terminal session and supports authenticated access. Telnet does not provide that encryption. HTTP-only access is also unencrypted, and CDP is a discovery mechanism, not an interactive CLI session. Encryption does not replace access-control configuration.

## S7-D2-Q09 - Controller-based WLANs and client connectivity

MEDIUM | Domain 2.0 | Primary objective 2.6 | Topic slug: `ccna-v1-1-s7-controller-wlan`

An AP joins a wireless LAN controller using CAPWAP. The WLAN is explicitly configured for central switching. Where is its client data normally tunneled for forwarding?

- **A.** Directly to every other AP without reaching the controller
- **B.** To a DNS server as the wireless data-plane gateway
- **C.** To the wireless LAN controller
- **D.** To the client device's DHCP lease database

**Correct: C.** In the stated centrally switched design, the AP tunnels client data to the controller, which forwards it onto the configured network. Other supported modes can switch client data locally, so controller management alone would not establish this data path.

## S7-D2-Q10 - Controller-based WLANs and client connectivity

MEDIUM | Domain 2.0 | Primary objective 2.9 | Topic slug: `ccna-v1-1-s7-controller-wlan`

A controller-managed SSID should place clients in the guest network. Clients associate successfully but receive addresses from the staff subnet. Which WLAN setting should be checked first?

- **A.** The text of the AP's physical inventory label
- **B.** The controller's preferred syslog severity
- **C.** The switch's MAC aging timer
- **D.** The WLAN's interface or VLAN mapping

**Correct: D.** The WLAN-to-interface or VLAN mapping determines the network into which client traffic is placed in the described design. Association success does not prove that this mapping is correct. DHCP configuration should also be checked after confirming that client traffic reaches the intended guest network.

## S7-D3-Q01 - Routing tables and forwarding decisions

HARD | Domain 3.0 | Primary objective 3.2 | Topic slug: `ccna-v1-1-s7-routing-table`

A router has installed routes for 10.40.0.0/16 via A, 10.40.8.0/24 via B and 0.0.0.0/0 via C. Where does it forward a packet to 10.40.8.77?

- **A.** Via B, using the /24 route
- **B.** Via A, because /16 covers more addresses
- **C.** Via C, because a default route overrides specific routes
- **D.** To all three next hops regardless of prefix length

**Correct: A.** Both the /16 and /24 match, but the /24 is the longest matching prefix. Forwarding selects the most specific installed route. The default route is used only when no more-specific match exists; administrative distance does not override this prefix-length comparison.

## S7-D3-Q02 - Routing tables and forwarding decisions

MEDIUM | Domain 3.0 | Primary objective 3.1 | Topic slug: `ccna-v1-1-s7-routing-table`

An IOS routing entry includes O 10.60.0.0/24 [110/20] via 192.0.2.2. What do the values in brackets represent?

- **A.** Metric 110 and prefix length 20
- **B.** Administrative distance 110 and metric 20
- **C.** OSPF process ID 110 and area ID 20
- **D.** TCP source port 110 and destination port 20

**Correct: B.** IOS displays administrative distance followed by the route metric as [AD/metric]. O identifies an OSPF-learned route, the prefix is /24, and 192.0.2.2 is its next hop. Process and area IDs are not encoded by those bracketed values.

## S7-D3-Q03 - Routing tables and forwarding decisions

MEDIUM | Domain 3.0 | Primary objective 3.2 | Topic slug: `ccna-v1-1-s7-routing-table`

A router learns the exact same /24 prefix through an ordinary static route with administrative distance 1 and through OSPF with distance 110. Both next hops are reachable. Which source is normally preferred for installing that prefix?

- **A.** OSPF because dynamic information always overrides static configuration
- **B.** Both routes solely because their prefix lengths match
- **C.** The static route with administrative distance 1
- **D.** The source with the larger administrative distance

**Correct: C.** For competing sources of the same prefix, a lower administrative distance is normally preferred. The static route wins over OSPF here. Longest-prefix forwarding applies between installed matching prefixes; it does not make all sources for one prefix equally preferred.

## S7-D3-Q04 - IPv4 and IPv6 static routes

EASY | Domain 3.0 | Primary objective 3.3 | Topic slug: `ccna-v1-1-s7-static-routing`

A router needs an IPv4 default static route through reachable next hop 192.0.2.1. Which IOS command expresses that route?

- **A.** ip route 255.255.255.255 255.255.255.255 192.0.2.1
- **B.** ipv6 route ::/0 192.0.2.1
- **C.** ip default-gateway 0.0.0.0
- **D.** ip route 0.0.0.0 0.0.0.0 192.0.2.1

**Correct: D.** An IPv4 default route has prefix 0.0.0.0/0, represented by destination and mask both 0.0.0.0 in this IOS command. A /32 route is a host route. ip default-gateway is not the requested routed IPv4 default-static command, and an IPv6 route does not express this IPv4 destination.

## S7-D3-Q05 - IPv4 and IPv6 static routes

MEDIUM | Domain 3.0 | Primary objective 3.3 | Topic slug: `ccna-v1-1-s7-static-routing`

An IPv6 static route should match only the single destination 2001:db8:10::7, not its surrounding subnet. What prefix length should that host route use?

- **A.** /128
- **B.** /64
- **C.** /48
- **D.** /0

**Correct: A.** An IPv6 address is 128 bits long, so a /128 route identifies exactly one address. A /64 or /48 includes many addresses; /0 is the default route. The documentation prefix in the example is for an illustrative configuration, not public deployment.

## S7-D3-Q06 - IPv4 and IPv6 static routes

HARD | Domain 3.0 | Primary objective 3.3 | Topic slug: `ccna-v1-1-s7-static-routing`

A reachable OSPF route to 10.70.0.0/24 has administrative distance 110. A static route through a reachable alternate next hop should install only when that OSPF route disappears. Which static administrative distance meets this requirement?

- **A.** 1
- **B.** 200
- **C.** 90
- **D.** 110

**Correct: B.** A floating static route uses a distance higher than the preferred route's distance. 200 is higher than OSPF's 110, so the OSPF route is preferred while present. A lower distance would favor the static route, and equal distance does not establish the requested strictly lower preference.

## S7-D3-Q07 - Single-area OSPFv2 neighbors and elections

MEDIUM | Domain 3.0 | Primary objective 3.4 | Topic slug: `ccna-v1-1-s7-ospfv2`

Two OSPFv2 routers share a broadcast subnet and use the same area and authentication. Which difference prevents their normal neighbor adjacency?

- **A.** Different locally significant OSPF process IDs
- **B.** Different, unique router IDs
- **C.** Mismatched hello and dead intervals
- **D.** Different host addresses within the same subnet

**Correct: C.** OSPF neighbors require compatible hello/dead intervals on the link. Process IDs are locally significant and need not match. Router IDs should be unique, and interfaces on the same subnet normally have different host addresses. Area, authentication and network parameters must also be checked during troubleshooting.

## S7-D3-Q08 - Single-area OSPFv2 neighbors and elections

HARD | Domain 3.0 | Primary objective 3.4 | Topic slug: `ccna-v1-1-s7-ospfv2`

An OSPF broadcast segment already has a healthy DR and BDR. A new router joins with a higher interface priority than either. Without a failure or election reset, what normally happens to the current DR?

- **A.** It immediately becomes a DROTHER solely because the newcomer has higher priority
- **B.** It disables its interface to prevent duplicate priorities
- **C.** It switches the area to point-to-point mode
- **D.** It remains DR because the established election is nonpreemptive

**Correct: D.** OSPF DR/BDR elections are nonpreemptive. A stronger router joining an established broadcast segment does not automatically displace the existing DR. Priority and router ID matter when an election is required, but do not by themselves force a fresh election here.

## S7-D3-Q09 - First-hop redundancy for host gateways

EASY | Domain 3.0 | Primary objective 3.5 | Topic slug: `ccna-v1-1-s7-first-hop-redundancy`

Two routers provide a first-hop redundancy group for a LAN. Which address should hosts generally use as their default gateway to benefit from that group?

- **A.** The group's virtual IP address
- **B.** The physical IP of whichever router was installed first
- **C.** The Ethernet broadcast address
- **D.** The IP address of the DNS server, regardless of its routing role

**Correct: A.** The virtual IP provides a stable gateway address while the protocol manages which router serves it. Pointing clients at one member's physical IP bypasses the intended virtual-gateway failover. DNS service and Layer 2 broadcast addresses are not substitutes for a host's IP next hop.

## S7-D3-Q10 - First-hop redundancy for host gateways

MEDIUM | Domain 3.0 | Primary objective 3.5 | Topic slug: `ccna-v1-1-s7-first-hop-redundancy`

A LAN's active virtual gateway router fails. Its standby is configured to take over the same virtual IP and protocol-defined virtual MAC. What is the main benefit for correctly configured hosts?

- **A.** They automatically move into a different IP subnet
- **B.** They can continue using the same default-gateway configuration after convergence
- **C.** They no longer require a default gateway for remote destinations
- **D.** Their application servers become redundant through the gateway protocol

**Correct: B.** The virtual gateway's stable IP and MAC allow the backup router to take over without manually reconfiguring each host's default gateway. Some convergence loss may occur. First-hop redundancy protects gateway availability, not arbitrary server applications or every other possible failure in the network.

## S7-D4-Q01 - Static and pooled inside-source NAT

MEDIUM | Domain 4.0 | Primary objective 4.1 | Topic slug: `ccna-v1-1-s7-inside-source-nat`

An IOS router uses ip nat inside source static 10.1.1.50 198.51.100.50. Which address is the inside-global representation of the inside host?

- **A.** 10.1.1.50
- **B.** 255.255.255.255
- **C.** 198.51.100.50
- **D.** The default gateway's MAC address

**Correct: C.** The command maps inside-local address 10.1.1.50 to inside-global address 198.51.100.50. The global address represents the inside host on the outside network. Interfaces and routing must also be configured correctly. The outside example uses a documentation address, not an address to deploy on the Internet.

## S7-D4-Q02 - Static and pooled inside-source NAT

HARD | Domain 4.0 | Primary objective 4.1 | Topic slug: `ccna-v1-1-s7-inside-source-nat`

Dynamic inside-source NAT has a pool of two global addresses and no overload. Two hosts currently hold active translations using both pool addresses. A third host needs a new translation while those mappings remain active. What is expected?

- **A.** The router automatically enables port overload to share an address
- **B.** The third host always replaces an active mapping immediately
- **C.** All three hosts can use the pool simultaneously with independent one-to-one mappings
- **D.** The third host cannot obtain a new mapping from the exhausted pool

**Correct: D.** Without overload, this pool supplies a unique global address to each active one-to-one mapping. Both addresses are allocated, leaving none for the new mapping. PAT does not enable itself. An address may become available after a mapping expires or is otherwise legitimately released.

## S7-D4-Q03 - DHCP addressing, relay and DNS resolution

MEDIUM | Domain 4.0 | Primary objective 4.6 | Topic slug: `ccna-v1-1-s7-dhcp-and-dns`

Clients in VLAN 40 need leases from a DHCP server at 10.99.0.10 on another subnet. Which IOS interface command on the client-facing routed interface configures the server destination for relay?

- **A.** ip helper-address 10.99.0.10
- **B.** ip name-server 10.99.0.10
- **C.** ntp server 10.99.0.10
- **D.** switchport access vlan 99

**Correct: A.** ip helper-address forwards selected UDP broadcasts, including DHCP requests, toward the specified server. DHCP client broadcasts normally do not cross a router unassisted. DNS and NTP commands configure different services, and moving access ports to the server VLAN is not the requested relay design.

## S7-D4-Q04 - DHCP addressing, relay and DNS resolution

EASY | Domain 4.0 | Primary objective 4.3 | Topic slug: `ccna-v1-1-s7-dhcp-and-dns`

A workstation already has valid IP settings but needs the IPv4 address corresponding to an application hostname. Which service performs that name-to-address resolution?

- **A.** NTP
- **B.** DNS
- **C.** LACP
- **D.** A first-hop redundancy election

**Correct: B.** DNS resolves domain names using records such as A records for IPv4 addresses. DHCP may supply a DNS server address, but providing IP configuration is distinct from answering a hostname lookup. Clock synchronization, link aggregation and gateway elections do not perform this lookup.

## S7-D4-Q05 - DHCP addressing, relay and DNS resolution

EASY | Domain 4.0 | Primary objective 4.3 | Topic slug: `ccna-v1-1-s7-dhcp-and-dns`

In conventional DHCPv4 operation, which UDP port pair identifies the server and client endpoints respectively?

- **A.** Server 68, client 67
- **B.** Server 53, client 123
- **C.** Server 67, client 68
- **D.** Server 22, client 23

**Correct: C.** DHCPv4 uses UDP port 67 at the server and port 68 at the client. Relay behavior can alter the path and addressing of messages, but does not turn the DHCP client/server service into DNS, NTP, SSH or Telnet.

## S7-D4-Q06 - NTP, SNMP and syslog operations

EASY | Domain 4.0 | Primary objective 4.2 | Topic slug: `ccna-v1-1-s7-monitoring-and-time`

Incident logs from several routers show inconsistent times, making event correlation difficult. Which service is designed to synchronize their clocks?

- **A.** CDP
- **B.** NAT
- **C.** 802.1Q
- **D.** NTP

**Correct: D.** NTP synchronizes clocks against time sources so that timestamps from different devices can be meaningfully compared. Time-zone display settings and log formatting also affect interpretation, but CDP, NAT and VLAN tagging do not provide clock synchronization.

## S7-D4-Q07 - NTP, SNMP and syslog operations

MEDIUM | Domain 4.0 | Primary objective 4.4 | Topic slug: `ccna-v1-1-s7-monitoring-and-time`

A monitoring platform periodically reads interface octet counters from a router to graph bandwidth use. Which protocol is intended for retrieving management objects such as these counters?

- **A.** SNMP
- **B.** DHCP
- **C.** TFTP
- **D.** Spanning Tree Protocol

**Correct: A.** SNMP managers can retrieve management objects from agents, including interface counters, and calculate rates from successive samples. Counter width, resets and the sampling interval matter when interpreting those rates. DHCP assigns configuration, TFTP transfers files, and STP prevents Layer 2 loops.

## S7-D4-Q08 - NTP, SNMP and syslog operations

MEDIUM | Domain 4.0 | Primary objective 4.5 | Topic slug: `ccna-v1-1-s7-monitoring-and-time`

An IOS device forwards syslog messages at the warnings threshold, severity 4. Which set of severity numbers is included?

- **A.** Only 4
- **B.** 0 through 4
- **C.** 4 through 7
- **D.** Only 7

**Correct: B.** Lower syslog numbers indicate more severe events. A warnings threshold includes level 4 and all more severe levels, 0 through 3. Notifications, informational and debugging, levels 5 through 7, are less severe and are excluded by this threshold.

## S7-D4-Q09 - QoS behavior and secure administration

MEDIUM | Domain 4.0 | Primary objective 4.7 | Topic slug: `ccna-v1-1-s7-qos-and-secure-operations`

A WAN edge should smooth traffic bursts by temporarily buffering excess packets and releasing them at a configured rate. Which QoS mechanism fits that requirement?

- **A.** Traffic policing without buffering
- **B.** Changing only the DSCP marking
- **C.** Traffic shaping
- **D.** Disabling all output queues

**Correct: C.** Shaping queues excess traffic and schedules it for later transmission, smoothing the output rate. Policing commonly drops or remarks traffic that exceeds its policy rather than delaying it in a shaping queue. Marking identifies treatment but does not by itself provide rate buffering.

## S7-D4-Q10 - QoS behavior and secure administration

MEDIUM | Domain 4.0 | Primary objective 4.8 | Topic slug: `ccna-v1-1-s7-qos-and-secure-operations`

An IOS router has a hostname, IP domain name and valid local user credentials, but RSA host keys have not been generated. Its SSH configuration requires RSA keys. What step supplies the missing cryptographic prerequisite?

- **A.** Enable Telnet as the only VTY transport
- **B.** Change the syslog threshold to debugging
- **C.** Configure a TFTP server as the authentication method
- **D.** Generate the RSA key pair with crypto key generate rsa

**Correct: D.** Under this IOS SSH design, RSA host keys support the SSH server's cryptographic identity. Hostname/domain configuration supports the key-generation setup, while VTY authentication and transport settings must also permit SSH. Telnet, syslog levels and TFTP do not generate the required host keys.

## S7-D5-Q01 - Risk reduction and authenticated device access

EASY | Domain 5.0 | Primary objective 5.1 | Topic slug: `ccna-v1-1-s7-risk-and-device-access`

A router's installed software contains a known remotely exploitable flaw. Which term best describes the flaw itself?

- **A.** A vulnerability
- **B.** An authorization rule
- **C.** A backup configuration
- **D.** A physical-access control

**Correct: A.** A vulnerability is a weakness that can be exploited. A threat is a potential source of harm, an exploit takes advantage of a weakness, and mitigation reduces risk, for example by applying an appropriate verified update. A known flaw is not itself a backup or access-control policy.

## S7-D5-Q02 - Risk reduction and authenticated device access

MEDIUM | Domain 5.0 | Primary objective 5.3 | Topic slug: `ccna-v1-1-s7-risk-and-device-access`

A Cisco router has a configured local username database. Its VTY lines should authenticate logins against that database without introducing an external AAA server. Which line command selects this local login method?

- **A.** no login
- **B.** login local
- **C.** login using only a configured line password
- **D.** service password-encryption as a replacement for login configuration

**Correct: B.** login local tells the line to use the local username database. The local user must exist, and the chosen transport must also be configured. no login removes the line's login check; an ordinary line-password login does not select the username database. Obfuscating configuration passwords does not choose an authentication method.

## S7-D5-Q03 - Risk reduction and authenticated device access

MEDIUM | Domain 5.0 | Primary objective 5.4 | Topic slug: `ccna-v1-1-s7-risk-and-device-access`

Which combination uses two different authentication-factor categories?

- **A.** A password and a memorized PIN
- **B.** Two different memorized passwords
- **C.** A password and a possession-based hardware security key
- **D.** A username and an account display name

**Correct: C.** A password is something known, while a hardware security key demonstrates possession. A password plus a PIN still combines two knowledge factors, not two categories. Usernames and display names identify an account but are not independent secret or possession proofs.

## S7-D5-Q04 - Ordered ACL decisions and IPsec VPN use

MEDIUM | Domain 5.0 | Primary objective 5.6 | Topic slug: `ccna-v1-1-s7-acls-and-vpns`

A standard IPv4 ACL entry should match all source hosts in 10.20.30.0/24. Which address and wildcard pair describes that subnet?

- **A.** 10.20.30.0 255.255.255.0
- **B.** 10.20.30.0 0.0.255.255
- **C.** 10.20.30.0 0.0.0.0
- **D.** 10.20.30.0 0.0.0.255

**Correct: D.** Wildcard zero bits must match and one bits may vary. For /24, the first 24 bits must match and the last eight may vary, producing 0.0.0.255. A wildcard is not the subnet mask; 0.0.0.0 matches just one address, while 0.0.255.255 covers a broader range.

## S7-D5-Q05 - Ordered ACL decisions and IPsec VPN use

HARD | Domain 5.0 | Primary objective 5.6 | Topic slug: `ccna-v1-1-s7-acls-and-vpns`

An applied standard ACL contains, in order, deny host 10.20.30.9 and permit 10.20.30.0 0.0.0.255, with no later entries. What happens to packets whose source is 10.20.30.9?

- **A.** They are denied by the first matching entry
- **B.** They are permitted because the broader permit is later
- **C.** The router combines both entries and splits the traffic equally
- **D.** They are permitted because standard ACLs ignore host addresses

**Correct: A.** ACL processing stops at the first matching entry. The host-specific deny matches 10.20.30.9 before the broader subnet permit is evaluated. Other matching subnet hosts may be permitted; sources matching neither entry encounter the implicit deny at the end.

## S7-D5-Q06 - Ordered ACL decisions and IPsec VPN use

EASY | Domain 5.0 | Primary objective 5.5 | Topic slug: `ccna-v1-1-s7-acls-and-vpns`

Two company offices need encrypted IP connectivity between their private networks across an untrusted WAN. Which design directly fits that network-to-network requirement?

- **A.** A shared plaintext Telnet session between users
- **B.** A site-to-site IPsec VPN between their gateways
- **C.** An unencrypted trunk extended without any tunnel protection
- **D.** A DNS alias pointing both offices at the same hostname

**Correct: B.** A site-to-site IPsec VPN connects networks through their gateways and can protect traffic confidentiality and integrity over an untrusted path. Remote-access VPNs serve individual remote endpoints instead. Name aliases and unencrypted management or Layer 2 transport do not provide the requested protection.

## S7-D5-Q07 - DHCP snooping and dynamic ARP inspection

MEDIUM | Domain 5.0 | Primary objective 5.7 | Topic slug: `ccna-v1-1-s7-layer2-security`

DHCP snooping is enabled for an access VLAN. The legitimate DHCP server is reached through one switch uplink. Which trust arrangement is appropriate?

- **A.** Trust all client ports so any attached host can send server replies
- **B.** Leave only the server-facing uplink untrusted while trusting clients
- **C.** Trust the known server-facing path and leave ordinary client access ports untrusted
- **D.** Disable snooping on the VLAN to classify server traffic

**Correct: C.** Trusted DHCP snooping ports admit the authorized server-side DHCP messages. Keeping endpoint ports untrusted helps block rogue offers from attached clients. The trust boundary must follow the verified legitimate server path; blanket trust removes the protection.

## S7-D5-Q08 - DHCP snooping and dynamic ARP inspection

HARD | Domain 5.0 | Primary objective 5.7 | Topic slug: `ccna-v1-1-s7-layer2-security`

Dynamic ARP inspection validates DHCP clients on an untrusted access port using the DHCP snooping binding table. An ARP reply claims a gateway IP with a MAC address inconsistent with the binding. What is the expected inspection result?

- **A.** Accept it and overwrite the gateway binding simply because it arrived most recently
- **B.** Convert the ARP message into an IPv6 neighbor advertisement
- **C.** Disable authentication on the switch's VTY lines
- **D.** Reject the inconsistent ARP claim according to the inspection policy

**Correct: D.** DAI checks ARP information against trusted validation data, including DHCP snooping bindings in this scenario. An inconsistent sender IP/MAC claim can be dropped, helping resist ARP spoofing. Static-addressed devices need an appropriate planned validation policy rather than an assumed DHCP binding.

## S7-D5-Q09 - AAA decisions and WLAN authentication

EASY | Domain 5.0 | Primary objective 5.8 | Topic slug: `ccna-v1-1-s7-aaa-and-wlan-security`

An administrator has already logged in successfully. A security policy then decides whether that account may run a configuration command. Which AAA function makes this permission decision?

- **A.** Authorization
- **B.** Authentication
- **C.** Accounting
- **D.** IPv4 address translation

**Correct: A.** Authentication establishes identity; authorization determines what that identity may do. Accounting records activity such as commands or session information. NAT translates network addresses and is not an AAA permission decision.

## S7-D5-Q10 - AAA decisions and WLAN authentication

MEDIUM | Domain 5.0 | Primary objective 5.10 | Topic slug: `ccna-v1-1-s7-aaa-and-wlan-security`

A small WLAN uses WPA2-Personal, and all authorized clients will be configured with the same passphrase. Which GUI security combination matches that design?

- **A.** WPA2-Enterprise requiring per-user 802.1X authentication through RADIUS
- **B.** WPA2 with AES-CCMP and pre-shared-key authentication
- **C.** Open authentication with no encryption
- **D.** Legacy WEP as a synonym for WPA2-Personal

**Correct: B.** WPA2-Personal uses a shared pre-shared key/passphrase, with AES-CCMP as the appropriate modern WPA2 cipher choice in this scenario. WPA2-Enterprise uses a different identity-based design, commonly 802.1X and RADIUS. Open access and WEP do not implement the specified WPA2-Personal protection.

## S7-D6-Q01 - Automation and controller-based networks

MEDIUM | Domain 6.0 | Primary objective 6.1 | Topic slug: `ccna-v1-1-s7-controller-automation`

A team will automate an approved configuration change across 40 switches. Which practice best reduces accidental changes to the wrong devices?

- **A.** Run against every discovered IP address without checking ownership
- **B.** Assume repeatable tooling makes scope review unnecessary
- **C.** Validate the target inventory and intended diff before applying the bounded change
- **D.** Suppress failed-device reporting so the batch appears successful

**Correct: C.** Automation can repeat a mistake at scale as easily as a correct change. Verifying inventory, intended differences and scope before execution helps preserve the approved boundary; post-change checks and failure reporting remain necessary. Repeatability is not a substitute for approval or validation.

## S7-D6-Q02 - Automation and controller-based networks

EASY | Domain 6.0 | Primary objective 6.3 | Topic slug: `ccna-v1-1-s7-controller-automation`

An orchestration application asks a network controller for topology and policy information. Which controller interface direction describes this application-to-controller interaction?

- **A.** Southbound device-control interface
- **B.** A host's default-gateway ARP cache
- **C.** An access-port VLAN assignment
- **D.** Northbound

**Correct: D.** Northbound APIs expose controller services to applications or orchestration systems. Southbound interfaces connect the controller's control functions with managed infrastructure. These directions describe architectural relationships, not compass locations or Ethernet port modes.

## S7-D6-Q03 - Automation and controller-based networks

MEDIUM | Domain 6.0 | Primary objective 6.3 | Topic slug: `ccna-v1-1-s7-controller-automation`

A tunnel-based overlay provides logical network segments above an IP-routed fabric. What is the underlay's main role in this design?

- **A.** Provide transport reachability between tunnel endpoints
- **B.** Replace every overlay segment with a DNS record
- **C.** Require the controller to forward every data packet itself
- **D.** Store user passwords as the only forwarding information

**Correct: A.** The underlay supplies the connectivity that carries encapsulated traffic between overlay endpoints. The overlay can present logical segmentation independently of the physical topology. A controller may coordinate policy without being in every packet's data path.

## S7-D6-Q04 - REST requests and JSON data interpretation

EASY | Domain 6.0 | Primary objective 6.5 | Topic slug: `ccna-v1-1-s7-rest-and-json`

An authenticated REST client needs to retrieve an existing interface resource without requesting a configuration change. Which HTTP method normally expresses this read operation?

- **A.** DELETE
- **B.** GET
- **C.** POST used to create a new interface resource
- **D.** PATCH used to modify interface attributes

**Correct: B.** GET normally retrieves a representation of an existing resource and is defined as a safe read method. POST, PATCH and DELETE have different intended semantics. Authentication and endpoint permissions are still required even for a read.

## S7-D6-Q05 - REST requests and JSON data interpretation

MEDIUM | Domain 6.0 | Primary objective 6.7 | Topic slug: `ccna-v1-1-s7-rest-and-json`

An API response is {"enabled":true,"vlans":[10,20]}. Which interpretation preserves its JSON types and values?

- **A.** enabled is the string true and vlans is a single string
- **B.** enabled is a numeric interface index and vlans contains only one element
- **C.** enabled is a boolean true and the second vlans array element is the number 20
- **D.** The response is invalid because JSON cannot contain arrays

**Correct: C.** Unquoted true is a JSON boolean. Brackets enclose an array, and [10,20] contains two numeric elements, with 20 second. Quoted strings, booleans and numbers are distinct data types; converting them indiscriminately can change an API request's meaning.

## S7-D6-Q06 - REST requests and JSON data interpretation

MEDIUM | Domain 6.0 | Primary objective 6.5 | Topic slug: `ccna-v1-1-s7-rest-and-json`

A protected REST endpoint rejects a request with HTTP 401 because its bearer credential is missing or invalid. What should the client address first?

- **A.** Deleting the resource to avoid authentication
- **B.** Changing the response format from JSON to YAML to gain permission
- **C.** Treating 401 as proof that an authenticated user has the required role
- **D.** Authentication credentials for the request

**Correct: D.** 401 identifies an authentication requirement or invalid credentials in this stated scenario. A validly authenticated account can still lack authorization; that is a separate issue, commonly expressed by 403. Changing serialization or deleting resources is not a credential fix.

## S7-D6-Q07 - Ansible and Terraform configuration workflows

EASY | Domain 6.0 | Primary objective 6.6 | Topic slug: `ccna-v1-1-s7-ansible-and-terraform`

A team selects an Ansible network module and supported transport to manage switches without installing a persistent automation agent on each switch. Which characteristic does this illustrate?

- **A.** Agentless management using supported remote interfaces
- **B.** A requirement to install the same Ansible daemon on every network device
- **C.** A guarantee that authentication is unnecessary
- **D.** A rule that playbooks cannot contain multiple tasks

**Correct: A.** Ansible commonly manages network devices through supported remote transports rather than a resident Ansible agent. Transport/module compatibility and authorized credentials still matter. Agentless operation does not eliminate authentication, and playbooks can contain multiple tasks.

## S7-D6-Q08 - Ansible and Terraform configuration workflows

MEDIUM | Domain 6.0 | Primary objective 6.6 | Topic slug: `ccna-v1-1-s7-ansible-and-terraform`

A Terraform configuration describes desired cloud-network resources. Which step lets a reviewer inspect proposed changes before approving their application?

- **A.** Delete the state file before each run to hide existing resources
- **B.** Generate and review a Terraform plan
- **C.** Apply every change immediately without reviewing the resource scope
- **D.** Replace the desired configuration with random addresses

**Correct: B.** A plan compares the configuration and known resource state to show intended changes before apply. Reviewing scope and consequences supports a controlled workflow. Deleting state can impair resource tracking and is not a safe review method.

## S7-D6-Q09 - Predictive and generative AI in operations

MEDIUM | Domain 6.0 | Primary objective 6.4 | Topic slug: `ccna-v1-1-s7-ai-network-operations`

A system learns patterns in historical link-utilization measurements and estimates next week's congestion risk. Which AI use best describes that activity?

- **A.** Generating a new router configuration solely from a text prompt
- **B.** Encrypting packets by replacing their headers with AI output
- **C.** Predictive analysis using historical telemetry
- **D.** Replacing all measurements with an administrator's password

**Correct: C.** Forecasting future behavior from historical telemetry is predictive analysis and may use machine-learning models. Generating new text or commands is a generative task. Prediction quality must be tested against real outcomes and changing traffic conditions; the forecast is not guaranteed fact.

## S7-D6-Q10 - Predictive and generative AI in operations

HARD | Domain 6.0 | Primary objective 6.4 | Topic slug: `ccna-v1-1-s7-ai-network-operations`

A generative AI assistant proposes a router configuration that looks plausible but includes a command unsupported by the target platform. What is the appropriate next action before any production application?

- **A.** Apply it immediately because confident language guarantees correctness
- **B.** Disable validation so unsupported commands cannot block deployment
- **C.** Share production credentials publicly to improve the model's confidence
- **D.** Review the proposal against the target platform's documentation and validate it in an approved test context

**Correct: D.** Generated configuration text can be inaccurate or unsupported even when fluent. Check platform/version compatibility, intended behavior and scope, then validate through an approved process before deployment. Confidence of presentation is not technical evidence or authorization.
