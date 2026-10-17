Scalability Discussion:

1. It does not make sense to call out a specific system is scalable or does not scale. e.g. X system is scalable or Y does not scale.

2. Disussing scalability means asking questions about:

	2.1 If the system grows in a particular way, what are our options for coping with the growth?
	2.2 How can we add computing resources to handle the additional load?

3. To answer those questions, we need to first describe the load on the system; then we can discuss the growth question 

4. The best way of describing load on a system is to use load parameters, some examples:
	It may be requests per second to a web server, 
	the ratio of reads to writes in a database, 
	the number of simultaneously active users in a chat room, 
	the hit rate on a cache, or something domain-specific. 
Load distribution also matter: sometimes the average case matters for capacity planning; in other cases your bottleneck is dominated by a small number of extreme cases.

5. Architecture decision on how to build scalable system depends on which operations will be common and which are rare - measured by the load parameters 
