import { describe, it, expect } from "vitest";
import {
  ccnaBookDomains,
  ccnaBookChapters,
  filterBookDomains,
  bookChapterReference,
} from "./ccna-book-chapters";
import { curriculumDomains } from "../../../api-server/src/lib/curriculum-config";

// Independent volume-ordered transcription of the supplied table. The domain
// columns deliberately exercise chapters reassigned across book boundaries.
const expectedV1 = [
  ["Introduction to TCP/IP Networking", "1.0"],
  ["Fundamentals of Ethernet LANs", "1.0"],
  ["Fundamentals of WANs and IP Routing", "1.0"],
  ["Using the Command-Line Interface", "2.0"],
  ["Analyzing Ethernet LAN Switching", "2.0"],
  ["Configuring Basic Switch Management", "2.0"],
  ["Configuring and Verifying Switch Interfaces", "2.0"],
  ["Implementing Ethernet Virtual LANs", "2.0"],
  ["Spanning Tree Protocol Concepts", "2.0"],
  ["RSTP and EtherChannel Configuration", "2.0"],
  ["Perspectives on IPv4 Subnetting", "1.0"],
  ["Analyzing Classful IPv4 Networks", "1.0"],
  ["Analyzing Subnet Masks", "1.0"],
  ["Analyzing Existing Subnets", "1.0"],
  ["Operating Cisco Routers", "3.0"],
  ["Configuring IPv4 Addresses and Static Routes", "3.0"],
  ["IP Routing in the LAN", "3.0"],
  ["Troubleshooting IPv4 Routing", "3.0"],
  ["Understanding OSPF Concepts", "3.0"],
  ["Implementing OSPF", "3.0"],
  ["OSPF Network Types and Neighbors", "3.0"],
  ["Fundamentals of IP Version 6", "1.0"],
  ["IPv6 Addressing and Subnetting", "1.0"],
  ["Implementing IPv6 Addressing on Routers", "3.0"],
  ["Implementing IPv6 Routing", "3.0"],
  ["Fundamentals of Wireless Networks", "1.0"],
  ["Analyzing Cisco Wireless Architectures", "2.0"],
  ["Securing Wireless Networks", "5.0"],
  ["Building a Wireless LAN", "2.0"],
];
const expectedV2 = [
  ["Introduction to TCP/IP Transport and Applications", "4.0"],
  ["Basic IPv4 Access Control Lists", "5.0"],
  ["Advanced IPv4 Access Control Lists", "5.0"],
  ["Security Architectures", "5.0"],
  ["Securing Network Devices", "5.0"],
  ["Implementing Switch Port Security", "5.0"],
  ["Implementing DHCP", "4.0"],
  ["DHCP Snooping and ARP Inspection", "5.0"],
  ["Device Management Protocols", "4.0"],
  ["Network Address Translation", "4.0"],
  ["Quality of Service (QoS)", "4.0"],
  ["Miscellaneous IP Services", "4.0"],
  ["LAN Architecture", "2.0"],
  ["WAN Architecture", "1.0"],
  ["Cloud Architecture", "1.0"],
  ["Introduction to Controller-Based Networking", "6.0"],
  ["Cisco Software-Defined Access (SDA)", "6.0"],
  ["Understanding REST and JSON", "6.0"],
  ["Understanding Ansible, Puppet, and Chef", "6.0"],
];
describe("supplied CCNA book reference integrity", () => {
  it("keeps exactly six ordered domains, fixed weights and supplied primary counts", () => {
    expect(ccnaBookDomains.map((d) => [d.code, d.examWeight, d.chapters.length])).toEqual([
      ["1.0", 20, 12],
      ["2.0", 20, 10],
      ["3.0", 25, 9],
      ["4.0", 10, 6],
      ["5.0", 15, 7],
      ["6.0", 10, 4],
    ]);
    expect(ccnaBookDomains.reduce((n, d) => n + d.examWeight, 0)).toBe(100);
    expect(ccnaBookDomains.map((d) => d.name)).toEqual([
      "Network Fundamentals",
      "Network Access",
      "IP Connectivity",
      "IP Services",
      "Security Fundamentals",
      "Automation and Programmability",
    ]);
  });
  for (const [volume, expected] of [
    ["V1", expectedV1],
    ["V2", expectedV2],
  ] as const) {
    it(`preserves every exact ${volume} title, original number and primary placement`, () => {
      const chapters = ccnaBookChapters
        .filter((c) => c.volume === volume)
        .sort((a, b) => a.chapterNumber - b.chapterNumber);
      expect(chapters.map((c) => [c.chapterNumber, c.title, c.primaryDomain])).toEqual(
        expected.map(([title, code], i) => [i + 1, title, code]),
      );
    });
  }
  it("has 48 unique volume/number pairs and IDs, each owned by exactly one primary domain", () => {
    expect(ccnaBookChapters).toHaveLength(48);
    expect(new Set(ccnaBookChapters.map((c) => `${c.volume}:${c.chapterNumber}`)).size).toBe(48);
    expect(new Set(ccnaBookChapters.map((c) => c.id)).size).toBe(48);
    for (const c of ccnaBookChapters)
      expect(ccnaBookDomains.filter((d) => d.chapters.includes(c)).map((d) => d.code)).toEqual([
        c.primaryDomain,
      ]);
  });
  it("supports combined case-insensitive search and volume filters without reweighting or renumbering", () => {
    expect(filterBookDomains("  v2 19 REST  ", "ALL")).toEqual([]);
    expect(filterBookDomains("  v2 19 chef  ", "ALL")[0].chapters[0]).toMatchObject({
      volume: "V2",
      chapterNumber: 19,
      title: expectedV2[18][0],
    });
    expect(filterBookDomains("IP Connectivity", "V1")[0]).toMatchObject({
      code: "3.0",
      examWeight: 25,
    });
    expect(filterBookDomains("", "V1").flatMap((d) => d.chapters)).toHaveLength(29);
    expect(filterBookDomains("", "V2").flatMap((d) => d.chapters)).toHaveLength(19);
    expect(filterBookDomains("unknown chapter", "V1")).toEqual([]);
    expect(Object.isFrozen(ccnaBookChapters[0])).toBe(true);
  });
  it("uses all 48 book chapters as navigation with stable UUIDs, without inventing an edition", () => {
    const navigation = curriculumDomains.flatMap((d) => d.sections.flatMap((s) => s.chapters));
    expect(navigation).toHaveLength(48);
    expect(navigation.map(n=>n.id).sort()).toEqual(ccnaBookChapters.map(c=>c.topicId).sort());
    expect(bookChapterReference).toMatchObject({
      examCode: "200-301",
      blueprintVersion: "1.1",
      edition: null,
      source: "User-supplied chapter classification",
    });
  });
});
