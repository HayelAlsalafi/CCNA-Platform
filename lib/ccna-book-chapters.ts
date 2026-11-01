const chapterIds: Readonly<Record<string, string>> = {
  "V1-1": "9d8bd104-2bc5-59c8-a417-367996c7d8b9",
  "V1-2": "6d0123a3-51bc-5740-a757-90d18f072691",
  "V1-3": "ec4f0e28-8827-503c-ba8e-5ae6b7fc7bcf",
  "V1-4": "4f8ef146-fc47-54a1-abd2-72de8847790f",
  "V1-5": "df66d0bb-2a56-5ca3-a4e3-de1c68952fed",
  "V1-6": "df86e7be-eddf-51c2-ab69-28e68d8877eb",
  "V1-7": "2bb7f503-d298-5a77-a705-cabfc7442b54",
  "V1-8": "8c394280-e569-5932-87a5-44e35364dfc2",
  "V1-9": "8b582547-9477-55d9-bf5e-83e00fd170be",
  "V1-10": "8b706c59-6619-5248-9f45-78327c252c6c",
  "V1-11": "a5c44824-b9be-5edd-890b-f92ed634aac4",
  "V1-12": "7131b37d-5eea-5e75-b6f2-f32d5551ccf0",
  "V1-13": "7ac614cc-4560-55ed-868d-21c4a304cad4",
  "V1-14": "0772d361-735d-5226-8219-234a664d15b5",
  "V1-15": "526d3656-ce63-5b0c-8073-6b5ae99af0da",
  "V1-16": "d55a2e6b-2393-50f8-bb2a-7619ccd1f5a4",
  "V1-17": "234c7939-bfc2-584e-bf56-ac8b6c82e720",
  "V1-18": "8c255b51-5d2f-5b23-af77-61ba3382e21d",
  "V1-19": "e00d1796-d454-51bb-87a9-32a4230d5b48",
  "V1-20": "1aa322d5-4f68-503f-88c6-49e40397dfcc",
  "V1-21": "bde56020-91ff-5d33-a515-b5ad3f93c2ff",
  "V1-22": "b6cc208c-755c-50de-b6a2-56369a67be32",
  "V1-23": "42bbf3b3-63b9-5080-b004-9e253cc11936",
  "V1-24": "f474f4fa-9de6-5342-be35-0a486b71aa0a",
  "V1-25": "e18f0c13-697f-57d0-bd29-a535a0f0fc42",
  "V1-26": "da7a9f7f-0476-55ce-a7f9-9e73efd05210",
  "V1-27": "24e9e02d-b0e5-5e48-a889-76cc636b90df",
  "V1-28": "9cd73c60-be76-5021-93fb-0b02e494d191",
  "V1-29": "b55745f2-eeb9-55c5-929d-661a5d9d45ba",
  "V2-1": "7ea5004b-4348-50e7-b5a5-5336a4a22fa0",
  "V2-2": "d96748da-cf21-5545-825d-a8247af609da",
  "V2-3": "e2cd9056-fa36-5bd6-bc38-7381d8cebacd",
  "V2-4": "febe43ab-71df-5b53-affd-2e2f7713529a",
  "V2-5": "c502194f-5b71-5a8c-abbb-7ac26d32e7b4",
  "V2-6": "b53763c4-c5e3-5ca1-9a7b-b0caae27cdb5",
  "V2-7": "87c0a77b-89e8-51d0-9418-164b2d17c3a6",
  "V2-8": "b6e2c220-4f3f-540c-9272-d059bd0123ab",
  "V2-9": "11dd687d-ee4a-5dba-b3ea-e371037f45c5",
  "V2-10": "cc6b5fb5-e208-5e25-a0d7-55345b8444c0",
  "V2-11": "782f69c3-f3df-5946-8053-b6efe9011e65",
  "V2-12": "5dda42f8-5284-5084-a6f5-d0fd087fc3b2",
  "V2-13": "fb642283-94ba-5035-b840-babeae13c37c",
  "V2-14": "7b2bdeeb-8f62-5225-ac19-4301f69e9b71",
  "V2-15": "91092882-ceef-5d7e-b767-6ff2a2dbf893",
  "V2-16": "0b420fca-11f5-5e9d-8ae5-e49061846319",
  "V2-17": "c6844fdc-169f-5fe5-b32b-b0fbbc64b49a",
  "V2-18": "fbe6cd90-ca47-5568-ace7-cfdd3dfe9c68",
  "V2-19": "73e0393e-0580-51e5-9a4b-3536d21fff5d",
};
/** Canonical educational chapters supplied by the user. Stable IDs are UUIDv5
 * of CCNA/1.1/volume/number; chapter titles are not official objective codes. */
export type BookVolume = "V1" | "V2";
export type BookDomainCode = "1.0" | "2.0" | "3.0" | "4.0" | "5.0" | "6.0";
export type BookChapter = Readonly<{
  id: string;
  topicId: string;
  code: string;
  slug: string;
  volume: BookVolume;
  chapterNumber: number;
  title: string;
  primaryDomain: BookDomainCode;
}>;
type ChapterInput = readonly [BookVolume, number, string];
type BookDomain = Readonly<{
  code: BookDomainCode;
  name: string;
  examWeight: number;
  chapters: readonly BookChapter[];
}>;
function domain(
  code: BookDomainCode,
  name: string,
  examWeight: number,
  chapters: readonly ChapterInput[],
): BookDomain {
  return Object.freeze({
    code,
    name,
    examWeight,
    chapters: Object.freeze(
      chapters.map(([volume, chapterNumber, title]) =>
        Object.freeze({
          id: `ocg-${volume.toLowerCase()}-${chapterNumber}`,
          topicId: chapterIds[`${volume}-${chapterNumber}`]!,
          code: `CCNA-${volume}-${String(chapterNumber).padStart(2, "0")}`,
          slug: `ocg-${volume.toLowerCase()}-${chapterNumber}`,
          volume,
          chapterNumber,
          title,
          primaryDomain: code,
        }),
      ),
    ),
  });
}
export const bookChapterReference = Object.freeze({
  examCode: "200-301",
  blueprintVersion: "1.1",
  book: "Official Cert Guide",
  edition: null,
  source: "User-supplied chapter classification",
  revision: "2026-10-17",
});
export const ccnaBookDomains: readonly BookDomain[] = Object.freeze([
  domain("1.0", "Network Fundamentals", 20, [
    ["V1", 1, "Introduction to TCP/IP Networking"],
    ["V1", 2, "Fundamentals of Ethernet LANs"],
    ["V1", 3, "Fundamentals of WANs and IP Routing"],
    ["V1", 11, "Perspectives on IPv4 Subnetting"],
    ["V1", 12, "Analyzing Classful IPv4 Networks"],
    ["V1", 13, "Analyzing Subnet Masks"],
    ["V1", 14, "Analyzing Existing Subnets"],
    ["V1", 22, "Fundamentals of IP Version 6"],
    ["V1", 23, "IPv6 Addressing and Subnetting"],
    ["V1", 26, "Fundamentals of Wireless Networks"],
    ["V2", 14, "WAN Architecture"],
    ["V2", 15, "Cloud Architecture"],
  ]),
  domain("2.0", "Network Access", 20, [
    ["V1", 4, "Using the Command-Line Interface"],
    ["V1", 5, "Analyzing Ethernet LAN Switching"],
    ["V1", 6, "Configuring Basic Switch Management"],
    ["V1", 7, "Configuring and Verifying Switch Interfaces"],
    ["V1", 8, "Implementing Ethernet Virtual LANs"],
    ["V1", 9, "Spanning Tree Protocol Concepts"],
    ["V1", 10, "RSTP and EtherChannel Configuration"],
    ["V1", 27, "Analyzing Cisco Wireless Architectures"],
    ["V1", 29, "Building a Wireless LAN"],
    ["V2", 13, "LAN Architecture"],
  ]),
  domain("3.0", "IP Connectivity", 25, [
    ["V1", 15, "Operating Cisco Routers"],
    ["V1", 16, "Configuring IPv4 Addresses and Static Routes"],
    ["V1", 17, "IP Routing in the LAN"],
    ["V1", 18, "Troubleshooting IPv4 Routing"],
    ["V1", 19, "Understanding OSPF Concepts"],
    ["V1", 20, "Implementing OSPF"],
    ["V1", 21, "OSPF Network Types and Neighbors"],
    ["V1", 24, "Implementing IPv6 Addressing on Routers"],
    ["V1", 25, "Implementing IPv6 Routing"],
  ]),
  domain("4.0", "IP Services", 10, [
    ["V2", 1, "Introduction to TCP/IP Transport and Applications"],
    ["V2", 7, "Implementing DHCP"],
    ["V2", 9, "Device Management Protocols"],
    ["V2", 10, "Network Address Translation"],
    ["V2", 11, "Quality of Service (QoS)"],
    ["V2", 12, "Miscellaneous IP Services"],
  ]),
  domain("5.0", "Security Fundamentals", 15, [
    ["V1", 28, "Securing Wireless Networks"],
    ["V2", 2, "Basic IPv4 Access Control Lists"],
    ["V2", 3, "Advanced IPv4 Access Control Lists"],
    ["V2", 4, "Security Architectures"],
    ["V2", 5, "Securing Network Devices"],
    ["V2", 6, "Implementing Switch Port Security"],
    ["V2", 8, "DHCP Snooping and ARP Inspection"],
  ]),
  domain("6.0", "Automation and Programmability", 10, [
    ["V2", 16, "Introduction to Controller-Based Networking"],
    ["V2", 17, "Cisco Software-Defined Access (SDA)"],
    ["V2", 18, "Understanding REST and JSON"],
    ["V2", 19, "Understanding Ansible, Puppet, and Chef"],
  ]),
]);
export const ccnaBookChapters: readonly BookChapter[] = Object.freeze(
  ccnaBookDomains.flatMap((d) => d.chapters),
);

/** Filtering never changes primary placement, original numbers or exam weights. */
export function filterBookDomains(search: string, volume: "ALL" | BookVolume) {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return ccnaBookDomains
    .map((d) => ({
      ...d,
      chapters: d.chapters.filter((c) => {
        const text =
          `${d.code} ${d.name} ${c.volume} volume ${c.volume.slice(1)} ${c.chapterNumber} ${c.title}`.toLowerCase();
        return (
          (volume === "ALL" || c.volume === volume) && terms.every((term) => text.includes(term))
        );
      }),
    }))
    .filter((d) => d.chapters.length > 0);
}
