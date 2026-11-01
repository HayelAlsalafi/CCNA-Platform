"""Original Chapter 1 continuation; writes content files only, never a database."""
import json, re, math, uuid, hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/content/ccna-200-301/chapter-1'
PACK_ID = 'ocg-v1-ch1-continuation-20261029-v1'
SOURCE_HASH = '5669aeb8e6fd799d011cfdb4c17b411e9c5202a5bac1978bcf36d096253df212'
lessons, figures, coverage = [], [], []
blocks = []

def lesson(title, group, pages, objectives):
    global blocks
    blocks = []
    value = {'title': title, 'group': group, 'printedPages': pages, 'objectives': objectives, 'blocks': blocks}
    lessons.append(value)
    return value

def add(kind, **fields):
    block = {'id': str(uuid.uuid5(uuid.NAMESPACE_URL, f'{PACK_ID}:{len(lessons)}:{len(blocks)}:{kind}')), 'type': kind, **fields}
    blocks.append(block)
    return block

def h(text, level=2): return add('heading', text=text, level=level)
def p(text):
    for paragraph in text.strip().split('\n\n'):
        add('paragraph', text=' '.join(paragraph.split()))
def li(*items, ordered=False): return add('list', ordered=ordered, items=list(items))
def table(headers, rows): return add('table', headers=headers, rows=rows, headerRow=True, columnWidth='auto')
def note(title, text, tone='note'): return add('callout', title=title, text=text, tone=tone)
def image(number, page, topic, description, carry=False):
    block = note(f'Image placeholder - Figure {number}', f'[IMAGE PLACEHOLDER]\nFigure: {number}\nSource page: {page} (PDF page {page-11})\nTopic: {topic}\nDescription: {description}\nStatus: Awaiting manual image insertion', 'info')
    figures.append({'figure':number,'printedPage':page,'pdfPage':page-11,'topic':topic,'description':description,'lesson':lessons[-1]['title'],'blockId':block['id'],'carryForwardFromProtectedLesson':carry})
def terms(rows):
    h('Key terms and distinctions')
    table(['Term', 'Meaning in this lesson'], rows)
def takeaway(*items):
    h('Key takeaways')
    li(*items)
def source(text):
    note('Source reference', text + ' All explanations in this new lesson use original educational wording. Figure assets are intentionally absent.', 'info')

lesson('1.1 Networking Models, Open Standards, and TCP/IP Layers', 'Networking architecture', [16,17,18,19], [
    'Distinguish a networking model, a protocol, and a physical networking requirement.',
    'Explain the move from proprietary architectures to open TCP/IP, including the role of OSI.',
    'Identify the five TCP/IP layers and the protocol examples supplied by the chapter.',
    'Explain how TCP/IP references external standards such as IEEE Ethernet.'
])
h('Continue from the existing 1.0 lesson')
p('''Lesson 1.0 already introduces network users, home Ethernet and cable Internet, wireless LAN and DSL, enterprise and SOHO networks, and the meaning of a cloud in a network diagram. It also introduces the blueprint analogy and TCP/IP adoption. Those explanations remain in the original lesson; this continuation does not replace them. We now examine what that networking blueprint actually contains and why a shared model matters when products come from different vendors.

Two figures referenced in 1.0 still need manual insertion. Their placeholders are collected here because the original lesson is protected from editing. Read them as companions to that completed material, not as a second introduction. Neither placeholder is an image request or a broken link.''')
image('1-1',14,'Home Internet access from the user perspective','Upper scene: PC to cable modem over Ethernet, then coaxial CATV connection toward the Internet. Lower scene: tablet over wireless LAN/Wi-Fi to a router, with DSL providing the Internet-side connection.',True)
image('1-2',15,'Enterprise access and omitted infrastructure','A wired PC reaches an enterprise network through Ethernet and the depicted SW1; a wireless user also accesses the enterprise network. The cloud deliberately hides infrastructure details that are irrelevant to the user-perspective discussion.',True)
h('A model is a coordinated collection of specifications')
p('''A networking model is also called a networking architecture or networking blueprint. It is not merely a drawing with layer names. It represents a comprehensive collection of documents whose individual specifications define small parts of the network's behavior. Taken together, those specifications explain how the complete network can work.

Some documents define protocols: logical rules that communicating devices must follow. Other documents define physical requirements, such as the voltage and current levels associated with sending data over a cable. The difference matters. A protocol tells implementations how to participate in a communication; a physical specification can tell hardware how signals must behave. A useful architecture accommodates both rather than treating all networking as application software.

The house analogy from 1.0 also applies to work that occupants never see. A sound plan coordinates the foundation, the structure, and the spaces needed for plumbing, electricity, and gas. Each trade can follow its own part without obstructing another trade. Network vendors likewise implement different portions of a common plan so that their products can operate together.

It would be possible to invent a private network by writing all its software and constructing its networking cards. The practical alternative is to buy products that already conform to recognized specifications. Following a shared model reduces the amount of coordination that every network builder would otherwise need to invent independently. Standards are therefore relevant both to the vendor developing a component and to the engineer combining components.''')
h('Why proprietary models created complexity')
p('''The present emphasis on TCP/IP was not inevitable. Early networking protocols were created by individual vendors and commonly supported that vendor's own computers. IBM, a major computer supplier during the 1970s and 1980s, published Systems Network Architecture (SNA) in 1974. Other companies developed their own proprietary models.

Imagine the source's company that purchases computers from three vendors. Its engineers could need three different networking environments and then some way to connect them. Each model might work well within its own environment, yet the combined enterprise would be more complex. The difficulty was not simply choosing a cable: the systems followed different networking plans.

An open, vendor-neutral model offered two benefits highlighted by the source: reduced complexity and greater opportunity for competition. Products could be built around a common architecture rather than requiring the customer to retain several incompatible vendor-specific designs.''')
table(['Period / effort','Source-supported development','Why it matters'],[
    ['1974; proprietary era','IBM publishes SNA; other vendors also develop their own models.','Multiple vendor architectures can coexist in one company, increasing integration work.'],
    ['Late 1970s onward; ISO effort','The International Organization for Standardization begins the work that becomes Open Systems Interconnection (OSI).','The goal is open standardized communication between computers from different vendors.'],
    ['DoD and university research effort','A less formal open-model effort grows from U.S. Department of Defense work, with university researchers volunteering to develop protocols.','This competing approach produces TCP/IP.'],
    ['1990s transition','Enterprises add TCP/IP, OSI, or both alongside older models. By the late 1990s, TCP/IP becomes the common choice.','Adoption happens over time; the source does not depict an instantaneous replacement.'],
    ['Twenty-first-century outcome described by the chapter','TCP/IP dominates; many proprietary architectures are discarded, while OSI terminology remains widely used.','A model can lose commercial adoption while its vocabulary remains important.']
])
image('1-3',17,'From proprietary architectures to open TCP/IP','Compare an enterprise using separate IBM, DEC and other-vendor models in the 1980s, a mixed transition including TCP/IP in the 1990s, and TCP/IP-dominated networking in the 2000s.')
p('''ISO pursued a formal international standardization process involving participants from many technologically developed nations. TCP/IP developed through a less formal effort. The chapter identifies OSI's slower formal standardization process as part of its difficulty gaining adoption relative to TCP/IP. It does not present OSI as the protocol suite that displaced TCP/IP.

The historical lesson is useful even before learning a particular header: an architecture coordinates many implementations, and adoption affects which architecture engineers actually encounter. OSI still matters later in this chapter because vendors and documents retained its layer terminology.''')
h('RFCs, referenced standards, and implementations')
p('''TCP/IP both defines protocols and references specifications written elsewhere. Requests For Comments (RFCs) are documents used to specify TCP/IP protocols. However, the model does not duplicate every useful standard in an RFC. Ethernet LAN standards, for example, come from the Institute of Electrical and Electronic Engineers (IEEE), and TCP/IP references IEEE Ethernet as an option.

That distinction prevents a common misunderstanding: using Ethernet in a TCP/IP network does not mean TCP/IP invented Ethernet or that its complete specification must be a TCP/IP RFC. The same architecture can combine protocols it defines with technologies supplied by other standards organizations.

Implementation is distributed across the products in a working computer. An operating system implements relevant TCP/IP software behavior. An Ethernet or wireless LAN card implements appropriate LAN standards. When the hardware and software vendors implement compatible specifications, a user can connect the equipment, start an application, and use the network without reconstructing the architecture from scratch.''')
h('Five functional layers')
table(['TCP/IP layer','Primary focus here','Relationship to the communication'],[
    ['Application','Network services used by application software.','The top of the model interfaces application needs with network communication.'],
    ['Transport','Services for the application layer; this chapter illustrates TCP error recovery.','Supports the applications that send and receive information.'],
    ['Network','Delivery across the complete path between the original sender and final destination.','IP addresses and routing support delivery across interconnected networks.'],
    ['Data Link','Delivery using a particular kind of physical link.','Ethernet LANs and wireless LANs use appropriate link-layer rules.'],
    ['Physical','Transmission of bits over an individual link.','Defines relevant physical signaling and media requirements.']
])
image('1-4',18,'Five-layer TCP/IP model','Stack Application above Transport, Network, Data Link and Physical. Preserve the distinction between complete-path delivery, one-link delivery, and actual bit transmission.')
note('Model-version note','The supplied chapter acknowledges an original four-layer TCP/IP version in RFC 1122 but uses the five-layer view for its main explanations. Do not silently count a sixth layer when the term Internet appears instead of Network.')
h('Protocol examples - reconstructed source Table 1-2')
table(['Source table layer label','Examples listed by the source'],[
    ['Application','HTTP, POP3, SMTP'],['Transport','TCP, UDP'],['Internet','IP, ICMP'],['Data Link & Physical','Ethernet, 802.11 (Wi-Fi)']
])
p('''Table 1-2 uses Internet for the network-layer category and combines Data Link & Physical into one row. Figure 1-4 separates those bottom functions. Both presentations are preserved here; a change in table labeling is not evidence that IP belongs at the transport layer or that Ethernet is an application protocol. The source's diagnostic material also uses PPP as a data-link protocol example; its configuration is not developed in this chapter.

Use the examples to attach names to roles, not to claim that this introductory table is a complete inventory of every protocol. HTTP, POP3 and SMTP illustrate application-layer membership; TCP and UDP illustrate transport. IP and ICMP belong to the network/Internet category. Ethernet and 802.11 are examples of referenced LAN technologies spanning the lower-layer discussion.''')
note('Exam distinction','Classify a protocol by its role. HTTP is not the browser application itself; TCP and UDP are not network-layer protocols; IP is not a data-link protocol. Lower-layer service details and the OSI numbering comparison follow in later lessons.','tip')
terms([['Networking model / architecture','A coordinated set of specifications covering the functions required for network communication.'],['Protocol','Logical communication rules followed by participating implementations.'],['RFC','Request For Comments: a document form used to define TCP/IP protocols.'],['IEEE Ethernet','An external LAN standard referenced by the model rather than redefined in TCP/IP RFCs.'],['Layer','A category of related networking functions within a model.'],['SNA / OSI / TCP/IP','Respectively, the cited IBM proprietary architecture, the ISO open-model effort, and the open architecture that became dominant.']])
takeaway('Continue from 1.0 without confusing a user-visible connection with the complete networking architecture.','A model includes physical specifications as well as protocol rules.','Remember the historical transition and distinguish RFC-defined protocols from referenced IEEE standards.','Use the five-layer model consistently while recognizing the alternative labels retained in the source table.')
source('Primary new coverage: printed pp. 16-19 / PDF pp. 5-8. Carry-forward placeholders 1-1 and 1-2 refer to printed pp. 14-15 / PDF pp. 3-4, whose explanations are already preserved in lesson 1.0. The supplied excerpt does not establish an exact book edition beyond its visible chapter identification.')

lesson('1.2 HTTP, TCP Recovery, and Layer Interactions', 'Application and transport services', [19,20,21,22], [
    'Explain how the application layer serves application software without defining the application itself.',
    'Trace the chapter\'s home.htm request and response, including HTTP headers and response codes.',
    'Explain the simplified TCP missing-segment recovery example using sequence labels 1, 2, and 3.',
    'Distinguish adjacent-layer service requests from same-layer protocol interaction.'
])
h('The application and the application-layer service are different')
p('''A web browser is application software running on a computer. HTTP is a protocol that supplies a network service the browser uses. Keeping those two ideas separate is the first step in understanding the application layer: the layer does not define the complete browser or every feature of a web server. It defines communication services that applications need.

In the source's example, the application-layer service lets a browser request the contents of a web page from a web server. The application layer therefore acts as an interface between software on the computer and the network. A user's simple action can depend on several layers even though only the final page is visible.

The chapter uses the web browser because it is familiar and because many applications are accessed through browsers. A user can type a website name and see a page without knowing what the server stores, which protocol messages cross the network, or which lower-layer services deliver them. The following sequence opens that otherwise hidden process.''')
h('Bob requests Larry\'s default web page')
p('''Bob is the browser user; Larry is the web server. Bob opens a browser configured to request Larry's default page. Larry's web-server software is configured to use a file named home.htm as that default page. Bob's initial action is a request for the page; Larry's response supplies the file's contents; Bob's browser displays those contents.

Notice which endpoint performs each task. The browser requests a resource. The server maps the request to its configured content and sends that content. Receiving the information is not the same operation as displaying it: Bob's browser uses the received file to present the page to the user.''')
image('1-5',19,'Basic application exchange for a web page','Show Bob the browser requesting the default page from Larry the web server, followed by Larry returning home.htm. Preserve request and response direction.')
h('HTTP makes the exchange a protocol')
p('''The protocol used by these two applications is Hypertext Transfer Protocol (HTTP). The source places its origin in Tim Berners-Lee's first browser and web-server work in the early 1990s. HTTP supplies a shared way for the browser to request a file and for the server to return its contents.

A protocol header is a location for information that the protocol needs to communicate. In this example, the request includes an HTTP header asking to get home.htm. If no file is specified, the server uses the configured default page. The operation is not simply an unexplained file moving between two applications: protocol information tells the other endpoint what is being requested or returned.

The source notes that a full web address, referred to there as a URL or URI, can begin with http to indicate HTTP transfer. This chapter uses that observation to connect a familiar browser address with a protocol name. It does not develop URL parsing, HTTP encryption variants, or application deployment procedures.''')
image('1-6',20,'HTTP request, response header, and subsequent data','Bob sends an HTTP GET for home.htm. Larry returns an HTTP response header indicating success and the first part of home.htm, then sends more file content in a further message without another repeated HTTP header.')
li('Bob sends the request. The HTTP header identifies a GET operation and, in the illustrated case, names home.htm.',
   'Larry sends the response. An HTTP response header reports the outcome, and the illustrated successful response includes the first portion of the web page.',
   'Larry supplies the rest of the file. In the simplified drawing, another data-carrying message follows without repeating that response header.', ordered=True)
table(['HTTP item from the chapter','Meaning in the illustrated exchange'],[
    ['GET home.htm','The browser asks the server to supply the named file.'],
    ['No explicit filename','The configured server default can identify the page to return.'],
    ['200','A successful response; the chapter associates it with OK.'],
    ['404','The requested page was not found; this is a response outcome rather than successful page content.'],
    ['Further data-only message','Continuation of the same file transfer in the example, without a duplicated HTTP header.']
])
note('Read the HTTP drawing at its intended level','Figure 1-6 illustrates where the HTTP request/response information and file data appear. Do not infer that every lower-layer message begins with a new HTTP header. The source deliberately omits a repeated HTTP header from the later data portion to avoid sending the same information unnecessarily.')
p('''The distinction between a response header and the response data is important. A server can communicate an outcome such as success or not found, and it can send actual page contents. Those are different functions even when the information appears in one outgoing message. The chapter's diagrams progressively add lower-layer headers to this same exchange, rather than introducing an unrelated application each time.''')
h('Why HTTP uses a transport-layer service')
p('''The TCP/IP transport layer has fewer protocol examples than the application layer. This chapter identifies Transmission Control Protocol (TCP) and User Datagram Protocol (UDP) as the two commonly used transport protocols. It then develops one particular TCP service: error recovery. It does not give a full transport-protocol comparison or a detailed UDP procedure.

Consider what the browser would experience if Bob's GET request disappeared on the path, or if Larry's response carrying the page disappeared. Without recovery, the expected page information would not arrive normally. This is not a problem unique to one web application. Many applications benefit from delivery support, so TCP supplies an error-recovery service that higher-layer protocols can use instead of making every application independently implement the same illustrated recovery logic.

The service is provided below the application layer. HTTP supplies its own request and response information, while TCP supplies information needed for its transport service. Both can be part of one communication without being the same protocol or belonging to the same layer.''')
h('The source\'s TCP recovery sequence')
image('1-7',21,'TCP detects and recovers a missing part of the web transfer','Larry sends three illustrated TCP segments labeled SEQ=1, SEQ=2 and SEQ=3. Segment 2 is lost. Bob receives 1 and 3, recognizes the gap, and sends TCP feedback labeled Send 2 Next toward Larry.')
li('Larry divides the illustrated web-page transfer across three messages. Each now has a TCP header as well as the HTTP-related data shown earlier. The drawing labels the messages with sequence values 1, 2, and 3.',
   'The network delivers the first message but fails to deliver the one labeled 2. The problem occurs in transit; it is not an HTTP instruction to skip part of the page.',
   'Bob receives messages labeled 1 and 3. The absence of 2 reveals that part of the transfer is missing.',
   'Bob\'s TCP logic sends a TCP message back toward Larry indicating that the missing item is needed next. This feedback/acknowledgment idea enables TCP recovery by causing the sender to supply the missing information again.', ordered=True)
p('''In this example, a TCP message is called a segment. Larry's TCP implementation creates the TCP header and its sequence information. Bob's TCP implementation interprets that information and reacts to the missing segment. HTTP does not create those TCP sequence fields, and Bob does not discover the transport gap merely by looking at an HTTP success code.

The numbered segments are the source's introductory illustration. Learn the recovery relationship it demonstrates: identifying a gap, communicating feedback, and supplying missing information again. The excerpt does not teach TCP field-size details, actual sequence-number arithmetic, retransmission timing, or the complete operation of transport protocols; those details should not be guessed from the three labels.''')
note('Exam distinction','A success indication at the application layer and recovery of missing transport data are separate services. Associate the GET and response code with HTTP; associate the sequence/recovery exchange shown here with TCP. The book points to a later Volume 2 transport-and-applications chapter for deeper treatment.','tip')
h('Two kinds of interaction are visible in the same exchange')
p('''Adjacent-layer interaction happens within one computer. A higher layer requests a service from the next lower layer, whose implementation performs that service. In the illustrated case, HTTP uses TCP's recovery service. The key tests are location and relationship: the interaction stays on one endpoint and crosses neighboring layers.

Same-layer interaction connects the logical peers on different computers. TCP at Larry and TCP at Bob exchange TCP information using TCP-defined headers. Larry marks the outgoing sequence information; Bob reads that information and responds with TCP feedback. The key tests are again location and relationship: the endpoints differ, but the protocol layer is the same.

These are not competing descriptions from which only one can be true. A single web exchange can contain local HTTP-to-TCP service use and remote TCP-to-TCP protocol communication. Identify the specific action being discussed before choosing the term.''')
h('Reconstructed source Table 1-3')
table(['Interaction','Where it occurs','How to recognize it','Chapter example'],[
    ['Same-layer interaction','Matching layers on different computers','A protocol-defined header communicates information between peer implementations.','Larry\'s TCP sequence information and Bob\'s TCP recovery feedback.'],
    ['Adjacent-layer interaction','Neighboring layers on one computer','The upper implementation asks the next lower implementation to provide a service.','HTTP uses the error-recovery service provided by TCP.']
])
terms([['Application software','The browser/server programs using network services; distinct from the protocol that supplies those services.'],['HTTP','The application-layer protocol used for the illustrated web request and response.'],['Header','Protocol information placed before the data associated with that protocol.'],['TCP / UDP','Transport-layer examples; the recovery procedure here is specifically TCP.'],['Segment','The transport-layer message name used for the TCP examples.'],['Same-layer / adjacent-layer','Peer communication across endpoints / service use between neighboring layers on one endpoint.']])
takeaway('Trace Bob\'s GET, Larry\'s response outcome, and the returned file as separate parts of the application exchange.','TCP adds recovery information without replacing HTTP\'s application function.','Use endpoint location and layer relationship to distinguish same-layer from adjacent-layer interactions.','Preserve the complete recovery example rather than memorizing only the term acknowledgment.')
source('Printed pp. 19-22 / PDF pp. 8-11; Figures 1-5 through 1-7 and Table 1-3. Protocol-layer recognition also reflects the diagnostic concepts on printed pp. 13-14, without reproducing its quiz items or answer key.')

lesson('1.3 IP Addressing and Routing from Sender to Destination', 'Network-layer delivery', [22,23,24,25], [
    'Explain addressing and routing as the main IP features introduced by the chapter.',
    'Use the postal-service comparison to distinguish endpoint work from forwarding work.',
    'Interpret the source\'s dotted-decimal addresses and illustrative address groups.',
    'Trace Larry\'s packet through R1 and R2 to Bob without confusing source, destination and next hop.'
])
h('From transport services to delivery across the network')
p('''The application layer has many protocols, and the transport layer includes TCP and UDP. The network layer also contains a small collection of protocols, but the central protocol in this chapter is Internet Protocol (IP). The name TCP/IP itself combines TCP and IP with a slash; it does not mean that only two protocols exist in the architecture.

IP supplies several features, with addressing and routing especially important here. Addressing identifies the devices involved and permits addresses to be grouped. Routing moves an IP packet toward the intended destination. These ideas extend the HTTP/TCP example: the browser and server can use their application and transport functions, while lower layers handle the path between them.

Do not interpret a diagram containing only Bob and Larry as a statement that no network exists between them. Earlier drawings intentionally hid that infrastructure to concentrate on application and transport logic. The next drawings reveal the routers and address information needed to explain network-layer delivery.''')
h('Postal delivery: the sender and the delivery system have different jobs')
p('''The source asks us to imagine preparing two letters: one to a friend across town and one to a friend across the country. The sender puts an address and stamp on each envelope and places both into the usual outgoing mailbox. From the sender's perspective, these two tasks are similar. The sender does not have to personally select every intermediate postal site.

The postal service must treat the letters individually. A local delivery might need forwarding onto another local truck. A cross-country delivery may require a sequence of postal sites and transportation links. At each site, the service examines the destination and decides where to send the letter next. Trucks, larger vehicles, planes, boats, sorting equipment and personnel form the infrastructure that makes those decisions useful.

Postal addressing also contains structure. A postal code, such as a U.S. ZIP code, groups addresses so that the service can direct letters toward the appropriate area without treating every building as an unrelated forwarding problem. Recognizing the address and recognizing a useful group of addresses are related ideas, but they are not the same as composing the letter's contents.''')
image('1-8',23,'Forwarding letters through a postal service','Show a local and a distant destination, with intermediate postal sites making next-location forwarding decisions. Preserve the distinction between the person depositing a letter and the postal infrastructure delivering it.')
table(['Postal-system role','Networking comparison','Important separation'],[
    ['A person writes and deposits an addressed letter.','Application and transport layers prepare communication and ask the layer below to deliver it.','An endpoint need not know the complete route.'],
    ['A postal address identifies the intended recipient location.','An IP address identifies a host within the network discussion.','The destination is not the same thing as the next intermediate site.'],
    ['Postal codes collect addresses into regions.','IP defines address grouping.','The source uses simple illustrative groups; detailed IP addressing follows later.'],
    ['Each postal site chooses where to forward a letter next.','A router examines destination information and selects how to forward an IP packet.','A next-step choice is made within a larger delivery process.'],
    ['Vehicles, sorting sites and routes move the letters.','Lower-layer network infrastructure carries the data along the chosen path.','A route decision still needs actual physical/link delivery.']
])
p('''The source compares the application and transport layers to the person sending the letter. These upper-layer functions can operate similarly whether the two endpoint computers are on one LAN or separated by the Internet. They request delivery rather than designing the infrastructure for each individual message.

The lower layers are more like the delivery service: they must understand enough about the underlying network to choose and carry out the next delivery step. IP routers perform the forwarding role, and the lower-layer mechanisms make it possible to move data between those devices. This analogy is a way to separate responsibilities, not a replacement for the specific IP and Ethernet operations described below.''')
h('IP hosts and dotted-decimal addresses')
p('''An IP host is a device with an IP address that connects to a TCP/IP network. The term is not restricted to a powerful server, a desktop PC, or a particular physical size. The source uses Bob and Larry as hosts, but its definition applies regardless of how large or capable a connected device is.

IP addressing must let a host be identified, just as delivery addressing must distinguish recipient locations. The source also introduces grouping addresses together. It does not yet teach subnet-mask calculations; its purpose is to make an address-based forwarding example understandable.

In Figure 1-9, Larry uses 1.1.1.1, Bob uses 2.2.2.2, and Archie uses 3.3.3.3. These addresses contain four numbers separated by periods: dotted-decimal notation (DDN). The periods are part of how the address is written, not an indication of application/transport layer boundaries.''')
table(['Host / location in the source','Example address','Illustrative group'],[
    ['Larry, upper-left network','1.1.1.1','1.__.__.__'],
    ['Bob, right-side network','2.2.2.2','2.__.__.__'],
    ['Archie, lower network','3.3.3.3','3.__.__.__']
])
image('1-9',24,'Hosts grouped around three IP routers','Show Larry at 1.1.1.1 on the upper-left address group, Bob at 2.2.2.2 on the right, Archie at 3.3.3.3 below, and routers R1, R2 and R3 connecting the relevant portions of the network.')
note('Do not turn the illustration into an unstated subnetting rule','The source groups these particular addresses by the first displayed number to introduce the idea of grouping. It supplies no subnet-mask calculation here. Learn the illustrated grouping without assuming that every real network always groups addresses in that same way.')
p('''The router icons introduce another device role. A router connects parts of a TCP/IP network and forwards IP packets toward the correct destination. It receives packets through physical interfaces, makes a forwarding decision using address information, and sends the packet through a selected network interface.

A router is therefore not merely a line drawn between two groups. It represents a decision-making step as well as a physical attachment to networks. This is why the postal-site comparison is useful: receiving an item and selecting its next direction are part of one forwarding responsibility.''')
h('Larry sends the web-page packet to Bob')
p('''Return to the web-page transfer. Larry has application data, the relevant HTTP information, and a TCP header ready to send. The network layer adds an IP header around the transport information and its data. In the illustrated packet, the IP source is 1.1.1.1, belonging to Larry, and the IP destination is 2.2.2.2, belonging to Bob.

The application and transport information has not disappeared when IP adds its header. It is now carried within the IP packet. Each layer contributes information appropriate to its job. IP supplies the addressing context that the routers will use to move the packet toward Bob.''')
image('1-10',25,'Basic IP forwarding through R1 and R2','Larry sends toward nearby R1. R1 uses destination 2.2.2.2 to select R2. R2 uses that destination to select delivery toward Bob. The packet shows source 1.1.1.1 and destination 2.2.2.2, with the TCP/HTTP information inside.')
li('Larry selects a nearby router on the same LAN, R1, as the next device to receive the packet. Larry relies on that router to continue delivery; he does not need a full map of all other routers.',
   'R1 receives the IP packet, examines destination 2.2.2.2, compares it with R1\'s known IP routes, and chooses to forward the packet to R2.',
   'R2 performs the same kind of destination-based comparison against its own routes. R2 chooses the network-side direction that delivers the packet onward to Bob.', ordered=True)
p('''The name for this packet-forwarding process is IP routing, often shortened to routing. Notice that R1 and R2 each make a decision; Larry does not make all the intermediate decisions in advance. Also notice that the decision is based on the packet's destination in this example. The source field identifies where the packet originated, while the destination field tells the forwarding devices which endpoint the communication is trying to reach.

The first selected router is not the final destination merely because it receives the frame carrying the packet next. Larry sends toward R1 so that the network can continue delivering toward Bob. The final-address and next-device distinction will matter again when we add the Ethernet frame in the following lesson.

IP's network-layer service spans the path between endpoint hosts. It does not remove the need for an individual link to get a packet from Larry to R1 or from one router to another. The next lesson fills in that local-delivery step rather than replacing IP's routing logic with a different explanation.''')
note('Exam distinction','For the illustrated Larry-to-Bob packet, identify 1.1.1.1 as the source, 2.2.2.2 as the destination, R1 as Larry\'s nearby next router, and R2 as R1\'s selected next router. Do not label R1 as the final destination just because it receives the next transmission.','tip')
terms([['IP','Internet Protocol; the principal network-layer protocol developed in this chapter.'],['IP host','A device with an IP address connected to a TCP/IP network, regardless of size or computing power.'],['DDN','Dotted-decimal notation: the four-number, period-separated form used by the example addresses.'],['Router','A device connecting network portions and forwarding IP packets through chosen interfaces.'],['IP routing','Destination-based packet forwarding from device to device toward the intended endpoint.'],['Source / destination','The illustrated original sender / intended final recipient, distinct from an intermediate forwarding device.']])
takeaway('Use the postal comparison to separate preparing information from delivering it.','An IP host needs identifying address information; IP also defines address grouping.','Trace each forwarding decision independently: Larry to R1, R1 to R2, R2 toward Bob.','The network-layer service still depends on link and physical delivery for each next step.')
source('Printed pp. 22-25 / PDF pp. 11-14, including Figures 1-8, 1-9 and 1-10. Chapter 3 is identified by the source as later, deeper WAN/IP-routing study; no unrelated routing configuration is introduced here.')

lesson('1.4 Ethernet Delivery and the Five Encapsulation Steps', 'Link delivery and message construction', [25,26,27,28], [
    'Separate physical signaling from the data-link rules that use a medium.',
    'Trace all four Ethernet delivery steps between Larry and R1.',
    'Explain encapsulation and de-encapsulation without confusing headers and trailers.',
    'Apply the full five-step sending process and distinguish segment, packet and frame.'
])
h('The route decision needs an actual link')
p('''Larry's IP process has chosen R1 as the next device to receive the packet. That decision alone does not move any bits. The source's simple line between Larry and R1 represents an Ethernet LAN, even though the drawing initially hides its cables and LAN devices.

The TCP/IP data-link and physical layers work together to perform that delivery. The physical layer concerns the media and the energy used to transmit data; the example uses electrical signals over Ethernet cabling. The data-link layer concerns the rules and protocol information used when communicating over that type of link. Some standards define aspects of both layers, so a single technology name can appear across their discussion without making the two functions identical.

The network layer is the customer of this lower-layer service. Once a host or router decides to send an IP packet to another host or router, the data-link and physical functions provide the means of reaching that next device. This is another adjacent-layer relationship: IP requests the service of the layer below it rather than becoming the link protocol itself.''')
table(['Question','Physical-layer focus','Data-link-layer focus'],[
    ['What aspect of the link is being discussed?','Cabling and the physical energy/signals representing transmitted bits.','Protocol rules governing delivery over that link type.'],
    ['What does the Ethernet example show?','Transmitting and interpreting electrical signals on the cable.','Adding/removing an Ethernet header and trailer around an IP packet.'],
    ['Why are the layers discussed together?','Physical transmission makes the bit delivery possible.','The link protocol organizes the transmission into the expected communication unit.']
])
note('Diagram convention','A series of lines can stand for an Ethernet LAN when the exact switches and cabling are irrelevant to the current explanation. Figure 1-11 uses that convention. Do not assume the simplified line means that the actual LAN lacks cables or LAN switches.')
h('All four steps: Larry delivers an IP packet to R1')
image('1-11',26,'Ethernet supplies IP with one-link delivery','Larry adds an Ethernet header and trailer around an IP packet, transmits the frame as electrical signals, and R1 reconstructs the bits and removes the Ethernet wrapper to recover the IP packet.')
li('Encapsulate at Larry: place the existing IP packet after an Ethernet header and before an Ethernet trailer. The combined object is an Ethernet frame.',
   'Transmit at Larry: send the bits representing that frame over the Ethernet cabling using electrical signaling.',
   'Receive at R1: interpret the arriving electrical signals and reconstruct the transmitted bits.',
   'De-encapsulate at R1: remove and discard the received Ethernet header and trailer so that R1 has the IP packet for its network-layer work.', ordered=True)
p('''The first two steps occur on Larry; the last two occur on R1. Keeping that boundary visible prevents a subtle error: creating a frame and interpreting the incoming signals are not both actions performed by the sender. The two devices cooperate to deliver the packet across the local Ethernet portion.

When this sequence finishes, the immediate accomplishment is delivery from Larry to R1. Bob is still the final IP destination in the larger example, but this frame exchange explains only the next delivery step. R1 can then apply its IP forwarding logic described in lesson 1.3. Do not confuse the scope of one Ethernet transfer with the scope of the entire IP route.

A header and a trailer serve the general purpose of carrying protocol-related information at different locations: the header is before the relevant data, the trailer after it. Removing the Ethernet wrapper is called de-encapsulation. It does not mean that the enclosed IP packet was the same thing as the wrapper or that the packet's information must be discarded with the Ethernet header and trailer.''')
h('What encapsulation means')
p('''Encapsulation adds a protocol's header, and when applicable a trailer, around information supplied from above. The enclosed information can itself contain headers introduced by other layers. Thinking in nested objects is more precise than thinking that every layer rewrites the same undifferentiated block of text.

The chapter has built this idea gradually. HTTP can place a header before the returned web content. TCP places its header before the application-layer information. IP places its header before the transport-layer information. Ethernet then places its header and trailer around the IP packet. Each addition is meaningful to the layer performing the addition.

The physical layer is different in this explanation. It sends the bits using signals on the medium. The source's fifth sending step is actual transmission, not the addition of another displayed header around the frame.''')
h('The complete five-step sending process')
li('Application: create the application data and include any application header the particular exchange requires. The source\'s example is an HTTP success response followed by part of a web page.',
   'Transport: place the application-layer information inside a transport header. TCP or UDP commonly supplies that header for the end-user applications discussed by the source.',
   'Network: add the IP header around the transport information. The IP addresses supply the endpoint-identification information used in the chapter\'s delivery discussion.',
   'Data Link: put a link header and trailer around the network-layer packet. In the Ethernet example, this produces the Ethernet frame.',
   'Physical: encode/transmit the frame\'s bits as signals over the medium.', ordered=True)
image('1-12',28,'Five-step TCP/IP encapsulation and transmission','Show application data, then a TCP header, then an IP header, then data-link header/trailer, followed by physical bit transmission. Number the stages 1 through 5 and align them with Application, Transport, Network, Data Link and Physical.')
note('Application headers are conditional','The chapter notes that application-layer data does not always require a newly displayed application header. Figure 1-12 therefore shows generic application data. This does not contradict the earlier HTTP example, which explicitly showed a required HTTP header.')
table(['Sending stage','Information added or handled','How the example grows'],[
    ['Application','Application data, with a header when the application protocol requires it.','HTTP information plus web-page data in the illustrated response.'],
    ['Transport','TCP or UDP header for the illustrated end-user traffic.','TCP header + application information.'],
    ['Network','IP header.','IP header + transport information.'],
    ['Data Link','Link header and link trailer.','Link header + IP packet + link trailer.'],
    ['Physical','Encoding and transmission of bits.','The frame is carried on the physical medium.']
])
h('Segment, packet and frame name different scopes')
p('''Networking language becomes much less confusing when the message name tells you which layer's wrapper you are discussing. In the chapter's TCP example, a segment consists of the TCP header and its following data. An IP packet consists of the IP header and its following data. A frame consists of a data-link header, the enclosed data, and a data-link trailer.

The word data is relative to that viewpoint. Inside an IP packet, the data may include a TCP header, an HTTP header, and part of a web page. When the discussion concentrates on IP, all of those enclosed pieces can be labeled simply data because the IP header is the object of interest. Calling that region data does not assert that the internal TCP or HTTP headers have vanished.

The same logic applies to a frame. Its enclosed data can be the full IP packet, including the IP header and whatever IP carries. A diagram can hide those inner details to keep attention on the layer being studied. Always ask: data from whose layer perspective?''')
image('1-13',28,'Layer-relative meanings of data and message names','Show TCP header + data labeled Segment, IP header + data labeled Packet, and link header (LH) + data + link trailer (LT) labeled Frame. The inner data may itself contain higher-layer headers.')
table(['Name used in this chapter','Layer focus','Included information'],[
    ['Segment','Transport, illustrated with TCP','TCP header and the information carried after it.'],
    ['Packet','Network, illustrated with IP','IP header and the information carried after it.'],
    ['Frame','Data Link, illustrated with Ethernet','Link header, enclosed data, and link trailer.'],
    ['LH / LT','Diagram abbreviations','Link header / link trailer.']
])
note('Exam distinction','Do not use segment, packet and frame as interchangeable answers to a layer-specific question. A frame includes a link-layer wrapper; an IP packet includes the network-layer wrapper; the chapter\'s TCP segment includes its transport wrapper.','tip')
terms([['Encapsulation','Adding the current layer\'s header, and sometimes a trailer, around information supplied by a higher layer.'],['De-encapsulation','Removing the applicable wrapper at the receiving device, as R1 does with the Ethernet header/trailer.'],['Header / trailer','Protocol information located before / after the enclosed data.'],['Frame','The complete link-layer message, not merely its enclosed IP packet.'],['Physical transmission','Encoding and sending the bits over the medium; the last step of the source\'s five-step sending process.']])
takeaway('Keep all four Ethernet steps and both participating devices in the explanation.','Link delivery is one part of the larger IP route.','Remember the complete five-step sending procedure, including conditional application headers and actual bit transmission.','Name each message from its layer perspective and interpret data as the enclosed information at that layer.')
source('Printed pp. 25-28 / PDF pp. 14-17, including the complete Figure 1-11 four-step procedure, Figure 1-12 five-step process, and Figure 1-13 message terminology and LH/LT footnote.')

lesson('1.5 OSI Layer Mapping and Protocol Data Units', 'OSI comparison and PDUs', [28,29,30], [
    'Map the seven OSI layers to the five-layer TCP/IP view used by the chapter.',
    'Interpret Layer 7 and Layers 5-7 references in TCP/IP discussions.',
    'Relate segment, packet and frame to layer-specific protocol data units.',
    'Interpret the L#H, L#T and LxPDU notation in the source\'s encapsulation drawing.'
])
h('Why learn OSI when the examples use TCP/IP?')
p('''The historical competition introduced in lesson 1.1 could have ended differently. At one time many people expected OSI to become the commonly deployed open networking architecture. That did not happen: TCP/IP became the mainstream architecture described throughout this chapter. Some protocols and standards referenced by OSI still exist, but this course is not asking you to replace your TCP/IP network with a full OSI protocol stack.

OSI remains useful because its terminology became embedded in vendor explanations and technical documents, particularly during the late 1980s and early 1990s. Engineers therefore need enough OSI knowledge to interpret the language of modern TCP/IP networking. This is a terminology and comparison task, not evidence that the devices in the earlier examples secretly used OSI instead of TCP/IP.

Both models organize network functions into layers, and each layer refers to protocols or standards that perform those functions. A model can also reference an existing external standard rather than invent an alternative. The source uses IEEE Ethernet again to illustrate that point: OSI's committees could refer to IEEE's Ethernet specifications instead of specifying a competing Ethernet simply to complete their own model.''')
h('Seven OSI layers and the TCP/IP comparison')
table(['OSI number','OSI layer','Corresponding category in this chapter\'s TCP/IP view'],[
    ['7','Application','Application'],['6','Presentation','Application'],['5','Session','Application'],
    ['4','Transport','Transport'],['3','Network','Network'],['2','Data Link','Data Link'],['1','Physical','Physical']
])
image('1-14',29,'OSI-to-TCP/IP layer mapping','Show OSI Application 7, Presentation 6 and Session 5 mapped to TCP/IP Application; Transport 4, Network 3, Data Link 2 and Physical 1 align with the corresponding TCP/IP categories. Preserve the supplied five-layer comparison.')
p('''The lower four categories align closely in name, numbering and purpose for the comparisons made in this chapter. Transport remains Layer 4, network remains Layer 3, data link remains Layer 2, and physical remains Layer 1 when engineers use OSI terminology to discuss the TCP/IP examples.

The upper part is different. TCP/IP includes a broader application category, while OSI separates session, presentation and application categories. That difference explains why a five-layer TCP/IP description and a reference to a Layer 7 application protocol can both be sensible. The latter reference uses OSI's numbering, not a claim that five has somehow become seven.

You may also encounter the expression Layers 5-7 for upper-layer/application-related functions. The source emphasizes knowing the mapping rather than trying to force each conversational use of application into a newly invented TCP/IP layer. In this chapter HTTP, POP3 and SMTP are application examples; a Layer 7 reference can still describe an application protocol used in a TCP/IP network.''')
note('Source-figure limitation','The supplied Figure 1-14 caption and nearby text mention comparison with two TCP/IP models, but the actual supplied drawing contains one TCP/IP column: the five-layer view. This lesson preserves that visible mapping. The earlier RFC 1122 note acknowledges the original four-layer version; no missing diagram column has been invented.','info')
note('Exam distinction','Do not move IP from Layer 3 or Ethernet from Layer 2 merely because a document switches between TCP/IP and OSI vocabulary. Also do not treat OSI\'s three upper categories as three extra layers appended above TCP/IP\'s application category. They are a comparison of functional groupings.','tip')
h('A generic name for a layer\'s complete message')
p('''OSI uses protocol data unit (PDU) as a general message term. A PDU includes that layer's header, any applicable trailer, and the information enclosed by that layer. A layer-specific PDU name identifies which wrapper is being discussed.

For example, the IP packet discussed earlier is a Layer 3 PDU, abbreviated L3PDU, because the IP header is a network-layer header. The Ethernet frame is a Layer 2 PDU, or L2PDU. The chapter's TCP segment can be described as a Layer 4 PDU. These are vocabulary correspondences for the already explained objects, not newly transmitted copies of them.

The generic form LxPDU uses x for the layer number being discussed. If the conversation concentrates on layer x, its complete object is the current PDU; after a lower layer adds its wrapper, that lower layer has its own PDU containing the earlier object as data. This is the same nesting idea used in lesson 1.4.''')
image('1-15',30,'OSI headers, encapsulation and layer-specific PDUs','Show nested L7H through L2H headers, with L2T at the end of the Layer 2 unit. Label the resulting objects L7PDU, L6PDU, L5PDU, L4PDU, L3PDU and L2PDU; explain L#H as layer-number header and L#T as layer-number trailer.')
table(['PDU in the supplied drawing','Outer information shown at that stage','What is enclosed'],[
    ['L7PDU','L7H','Application-level data.'],
    ['L6PDU','L6H','The higher-layer information, including the previously shown L7 unit.'],
    ['L5PDU','L5H','The higher-layer information supplied to Layer 5.'],
    ['L4PDU','L4H','The higher-layer information supplied to transport.'],
    ['L3PDU','L3H','The transport-layer information; an IP packet is the chapter\'s example.'],
    ['L2PDU','L2H at the front and L2T at the end','The network-layer information; an Ethernet frame is the chapter\'s example.']
])
p('''In the notation L#H and L#T, the number sign stands for the layer number, H for header, and T for trailer. The supplied drawing explicitly shows a Layer 2 trailer. Do not read its omission at another displayed stage as a complete specification for every protocol that could ever operate at that layer; the general source explanation permits a header and, where applicable, a trailer.

Likewise, the TCP/IP sending process ends with physical transmission of bits. The source does not label a frame as a Layer 1 PDU: the correspondence to remember for frame is Layer 2. The physical layer carries the representation of the information across the medium rather than changing the meaning of frame into an interchangeable name for every layer's message.''')
terms([['OSI layer numbering','The seven-layer reference used in Layer 7 or Layers 5-7 discussions, even in TCP/IP documentation.'],['PDU / LxPDU','A complete unit at the stated protocol layer / the same term qualified by a layer number.'],['L#H / L#T','The source\'s layer-number header / layer-number trailer notation.'],['L4PDU / L3PDU / L2PDU','Layer-specific descriptions corresponding to the TCP segment, IP packet and link frame discussed in the chapter.']])
takeaway('Use OSI as a vocabulary and comparison framework without changing the TCP/IP examples into an OSI deployment.','The bottom four categories align; OSI Layers 5-7 map to the broader TCP/IP application category.','A lower-layer PDU includes the higher-layer information as its data.','Treat the actual visible five-layer comparison as the source figure; do not invent its absent alternative column.')
source('Printed pp. 28-30 / PDF pp. 17-19, including Figures 1-14 and 1-15 and the source\'s Layer 7 / Layers 5-7 and LxPDU terminology.')

lesson('1.6 Chapter Review and Networking Vocabulary', 'Chapter consolidation', [30,31], [
    'Revisit all seven highlighted key-topic elements and locate their source pages.',
    'Define all nine terms in the source\'s final key-term list.',
    'Connect the HTTP, TCP, IP and Ethernet examples into one coherent explanation.',
    'Use the source\'s review and diagnostic resources without confusing reference tables with persisted study tracking.'
])
h('Return to every highlighted chapter topic')
p('''The chapter closes by recommending deliberate review rather than immediately moving on. Its study-plan discussion refers to tools in the book and companion materials. Use the following reconstructed locator to revisit the highlighted concepts and check whether you can explain the process, not just recognize a term.

The source page numbers below are printed book pages, not the PDF viewer's page count. In this supplied 20-page excerpt, printed page 12 corresponds to PDF page 1; printed page 31 corresponds to PDF page 20. The original excerpt remains the reference if you want to locate a figure caption or the licensed diagnostic material.''')
h('Reconstructed source Table 1-5: key-topic locator',3)
table(['Source element','Review target in original educational wording','Printed page','Continuation lesson'],[
    ['Table 1-3','Compare remote peer-layer communication with local adjacent-layer service requests.','22','1.2'],
    ['Figure 1-10','Trace the basic IP route from Larry through R1 and R2 toward Bob.','25','1.3'],
    ['Figure 1-11','Explain how Ethernet delivers the IP packet across the link to R1.','26','1.4'],
    ['Figure 1-12','Recall all five sending/encapsulation stages, including physical transmission.','28','1.4'],
    ['Figure 1-13','Identify the complete message denoted by segment, packet and frame.','28','1.4'],
    ['Figure 1-14','Map the OSI names/numbers to the chapter\'s TCP/IP categories.','29','1.5'],
    ['Figure 1-15','Interpret encapsulation using layer-specific PDU terminology.','30','1.5']
])
h('Review resources and study tracking',3)
table(['Review element from source Table 1-4','Review date(s)','Resource identified by the source'],[
    ['Review the key topics','','Book; companion website'],
    ['Review the key terms','','Book; companion website'],
    ['Work through the source diagnostic questions in your licensed copy','','Book; PTP Online']
])
note('This is a review aid, not a new progress form','The blank date column preserves the source\'s tracking structure as editable lesson content for the administrator. It does not create a new student data-entry or chapter-completion system. Record study dates in your own study record; existing reader progress features remain separate and unchanged.')
p('''The source's opening diagnostic section is a way to decide how much study time a section needs. Its question wording and answer key are not reproduced in these lessons. The underlying technical distinctions are taught in the relevant lessons: application/transport/data-link membership, same-layer versus adjacent-layer interaction, encapsulation, frame terminology, and Layer 2 PDU terminology.

For the source's own questions and explanations, use your licensed book or its companion/PTP resources. The source points to Appendix C and the companion resources for its explanations. These platform lessons are newly worded instruction, not a copy of that assessment or a claim that the book's external testing software is integrated into this site.''')
h('Reconstructed source Table 1-1: diagnostic scope',3)
table(['Source foundation section','Source diagnostic question range','Where to study the concepts here'],[
    ['Perspectives on Networking','None','Existing lesson 1.0; no duplicate lecture added.'],
    ['TCP/IP Networking Model','1-4','Lessons 1.1-1.3 and lower-layer delivery in 1.4.'],
    ['Data Encapsulation Terminology','5-7','Lesson 1.4 and OSI PDU terminology in 1.5.']
])
h('Complete chapter key-term review')
table(['Source key term','Working definition grounded in the chapter'],[
    ['Adjacent-layer interaction','A higher layer on one device requests a service from the next lower layer on that device.'],
    ['De-encapsulation','Removing the applicable receiving-layer header/trailer, as R1 does with the Ethernet wrapper.'],
    ['Encapsulation','Adding a protocol header, and sometimes a trailer, around information supplied by a higher layer.'],
    ['Frame','A data-link-layer header, enclosed data and trailer considered as one message.'],
    ['Networking model','The coordinated architecture/specifications describing how the network\'s functions and components work together.'],
    ['Packet','The network-layer message; the IP header plus the information it encloses.'],
    ['Protocol data unit (PDU)','The complete unit at a stated protocol layer, including its applicable wrapper and enclosed information.'],
    ['Same-layer interaction','Protocol communication between matching layers on different devices, using their protocol information.'],
    ['Segment','The transport-layer message name used for TCP header plus enclosed application information in the chapter.']
])
h('An end-to-end explanation you should now be able to give')
note('Review method','For each highlighted element, explain the relationship before checking the locator table. Memorizing isolated layer numbers is not enough to trace the chapter\'s delivery process. The prompts below are original review activities, not copies of the source\'s quiz and not submitted learner attempts.','tip')
li('Describe two actions from the HTTP/TCP exchange: one crossing adjacent layers on a single device, and one connecting peer layers on different devices. Explain what changes between the two perspectives.',
   'Trace Larry\'s packet to Bob using R1 and R2. State which destination each router examines and separate that final destination from the next device receiving the packet.',
   'Reconstruct the four Ethernet delivery actions. Assign each action to Larry or R1, and distinguish physical signal processing from adding or removing a protocol wrapper.',
   'Write the five sending stages in order. Include the conditional application header, both link-layer wrapper positions, and the physical transmission step.',
   'Describe what data means inside an IP packet. Name at least two higher-layer components that can be present even when a diagram labels them together as data.',
   'Draw the seven OSI names beside the five TCP/IP categories. Explain why HTTP can be called Layer 7 even though this chapter uses a five-layer TCP/IP model.',
   'Translate the source\'s TCP segment, IP packet and Ethernet frame into layer-specific PDU names. Identify the header/trailer notation without assigning a Layer 2 frame to Layer 1.', ordered=True)
p('''Start with Bob asking Larry for home.htm using HTTP. Explain the request header, the server response code, and the page data. Describe why HTTP uses a transport service and how the source's TCP example detects the missing segment labeled 2. Distinguish the local HTTP-to-TCP request for service from TCP peer interaction between the two computers.

Next add Larry's source IP address 1.1.1.1 and Bob's destination 2.2.2.2. Trace the separate forwarding decisions made by Larry, R1 and R2. At the first Ethernet step, describe encapsulation into a frame, electrical transmission, bit reception at R1, and de-encapsulation back to the IP packet. Finally, name segment, packet and frame from their layer perspectives and translate them to the appropriate PDU vocabulary.

This connected account links the chapter's examples without adding an unrelated protocol, configuration exercise, or unsupported diagram. If any transition is unclear, return to the lesson and source locator covering that transition. The purpose of review is to make the relationships usable, not simply to memorize disconnected lists.''')
takeaway('OSI terminology remains useful even though the running examples use TCP/IP.','Map the bottom four layer names/numbers directly; map OSI Layers 5-7 to the broader TCP/IP application category.','PDU is a generic complete-message term qualified by a layer number.','Use the seven highlighted review targets and all nine key terms to consolidate the chapter; consult the licensed source for its unmodified diagnostic questions.')
source('Printed pp. 30-31 / PDF pp. 19-20; Tables 1-4 and 1-5; complete final key-term list. The diagnostic-scope table references printed p. 13 / PDF p. 2. The original seven quiz items and answer key are intentionally excluded, while their technical concepts are covered in the lessons.')

def build():
    baseline = json.loads((ROOT/'.local/chapter1-authoring/baseline.json').read_text(encoding='utf-8'))
    assert baseline['protectedFingerprint'] == 'c49a392eb0e5f701b98ede455f8425fd2288b07cf767a396d21025977105a203'
    assert baseline['protectedLesson']['id'] == 'ec725a65-e699-4938-a103-bc67f81a13fc'
    assert baseline['protectedLesson']['displayOrder'] == 0
    assert len(baseline['existingLessons']) == 1
    OUT.mkdir(parents=True, exist_ok=True)
    payloads=[]
    for index,item in enumerate(lessons):
        visible=[];table_cells=0;steps=0
        for block in item['blocks']:
            for key in ['text','title']:
                if key in block: visible.append(block[key])
            if block['type']=='table':
                visible.extend(block['headers'])
                visible.extend(v for row in block['rows'] for v in row)
                table_cells+=sum(len(row) for row in block['rows'])+len(block['headers'])
            if block['type']=='list':
                visible.extend(block['items'])
                if block['ordered']:steps+=len(block['items'])
        words=len(re.findall(r"\b[\w'-]+\b",' '.join(visible)))
        # Technical prose at 180 wpm, plus explicit table/procedure/figure study.
        image_count=sum(f['lesson']==item['title'] for f in figures)
        minutes=math.ceil(words/180+table_cells*.015+steps*.1+image_count*.12)
        payload={
            'chapterId':baseline['context']['chapter']['id'],'title':item['title'],
            'description':f"Chapter 1 continuation - {item['group']}. Source: printed pp. {min(item['printedPages'])}-{max(item['printedPages'])}.",
            'objectives':item['objectives'],'estimatedMinutes':minutes,
            'displayOrder':(index+1)*10,'blocks':item['blocks']}
        assert len(payload['blocks'])<=200
        assert len(json.dumps(payload).encode())<512000
        payloads.append({'group':item['group'],'wordCount':words,'readingTimeCalculation':{'technicalWordsPerMinute':180,'tableCells':table_cells,'procedureSteps':steps,'figures':image_count},'printedPages':item['printedPages'],'payload':payload})
    assert sorted(f['figure'] for f in figures)==sorted(f'1-{i}' for i in range(1,16))
    pack={'packId':PACK_ID,'source':{'path':'CCNA-200-301  Volume -1_compressed (1).pdf','sha256':SOURCE_HASH,'pdfPages':20,'printedPages':'12-31','bookEdition':'Not established by supplied excerpt'},
        'chapter':baseline['context'],'protectedLessonId':baseline['protectedLesson']['id'],'protectedFingerprint':baseline['protectedFingerprint'],
        'protectedPublishedFingerprint':hashlib.sha256(json.dumps(baseline['protectedPublished']['lesson'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')).hexdigest(),
        'chapterContextFingerprint':baseline['chapterContextFingerprint'],'baselineExistingLessons':baseline['existingLessons'],
        'lessons':payloads,'images':figures,
        'exclusions':['Original seven diagnostic quiz questions and answer key are not reproduced; technical concepts are taught.','Original figure assets intentionally absent; fifteen explicit manual-image placeholders provided.','No invented missing four-layer column for Figure 1-14.'],
        'overlap':'Protected lesson 1.0 covers printed p.12 and Perspectives on Networking on pp.14-16. Its body/revisions are neither copied into the new lessons nor updated.'}
    (OUT/'chapter-1-content-pack.json').write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    image_rows=['# Manual image checklist','', 'No images were extracted, uploaded, linked externally, or generated for these lessons. Placeholders are native text callouts.','', '| Figure | Printed / PDF page | Lesson | Technical meaning |','| --- | --- | --- | --- |']
    for f in figures:image_rows.append(f"| {f['figure']} | {f['printedPage']} / {f['pdfPage']} | {f['lesson']} | {f['description']} |")
    image_rows+=['','Figures 1-1 and 1-2 accompany protected lesson 1.0; their placeholders are at the start of 1.1 because 1.0 cannot be edited. Adding images inside 1.0 would require separate authorization.']
    (OUT/'image-checklist.md').write_text('\n'.join(image_rows)+'\n',encoding='utf-8')
    summary=[{'title':x['payload']['title'],'minutes':x['payload']['estimatedMinutes'],'words':x['wordCount'],'blocks':len(x['payload']['blocks']),'tables':sum(b['type']=='table' for b in x['payload']['blocks'])} for x in payloads]
    print(json.dumps({'lessons':summary,'totalMinutes':sum(x['minutes'] for x in summary),'images':len(figures)},indent=2))

if __name__=='__main__':build()
