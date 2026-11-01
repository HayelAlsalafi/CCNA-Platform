// @vitest-environment jsdom
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {expect,it,vi} from 'vitest';
vi.mock('@clerk/react',()=>({useAuth:()=>({isLoaded:true,isSignedIn:false})}));
import {ExamSimulatorPage} from './exam-simulator';
it('never offers a hardcoded exam or sends exam requests for a signed-out visitor',()=>{
 const client=new QueryClient();
 const html=renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(ExamSimulatorPage)));
 expect(html).toContain('Sign in to save exams');expect(html).not.toContain('button-start-exam');expect(html).not.toContain('Which destination MAC');client.clear();
});
